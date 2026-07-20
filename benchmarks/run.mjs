#!/usr/bin/env node
// benchmarks/run.mjs
//
// Runs the same prompt against multiple OpenCode models via `opencode run`,
// records latency/tokens/cost, and writes one JSON result file per invocation.
//
// Usage:
//   node benchmarks/run.mjs --models <id,id,...> --prompt <path> [--timeout 300] [--out benchmarks/results/]
//
// Zero npm dependencies. Node >= 20 (uses fs/promises, node:child_process, etc).
//
// Token counting: `opencode run --format json` emits newline-delimited JSON
// events on stdout, including a `step_finish` event with a `tokens` object
// ({ input, output, reasoning, total, cache }). When that is present we use
// it directly and mark token_source "reported". If a run errors out before
// any step_finish event (or the model/provider never emits one), we fall
// back to token_source "estimated" using ceil(chars / 4) on the prompt text
// (input) and whatever text was captured (output). Reasoning tokens (used by
// "thinking"/reasoning-tuned models) are folded into output_tokens for cost
// purposes, matching how providers typically bill them.

import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const HELP = `
Usage: node benchmarks/run.mjs --models <id,id,...> --prompt <path> [--timeout 300] [--out benchmarks/results/]

  --models   Comma-separated OpenCode model IDs, e.g.
             ollama-local/llama3.2:1b,ollama-local/gemma2:2b
  --prompt   Path to a benchmark prompt file (benchmarks/prompts/*.md)
  --timeout  Per-model wall-clock timeout in seconds (default: 300)
  --out      Directory to write the result JSON file into
             (default: benchmarks/results/ next to this script)

The opencode binary is resolved from $OPENCODE_BIN, falling back to
"opencode" on PATH. It is never hardcoded to an absolute path.

Each model is run in its own throwaway temp directory (via opencode's --dir)
so that any tool call the model attempts can't touch this repo.
`;

function parseArgs(argv) {
  const args = { timeout: 300, out: path.join(__dirname, 'results') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') args.models = argv[++i];
    else if (a === '--prompt') args.prompt = argv[++i];
    else if (a === '--timeout') args.timeout = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a} (see --help)`);
  }
  return args;
}

// Minimal parser for our own prompt frontmatter format:
//   ---
//   category: coding
//   expects:
//     - "some assertion"
//     - "/some-regex/i"
//   ---
//   <body sent to the model>
function parsePromptFile(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) {
    return { category: 'unknown', expects: [], body: raw.trim() };
  }
  const [, front, body] = m;
  let category = 'unknown';
  const expects = [];
  const lines = front.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const catMatch = line.match(/^category:\s*(.+)$/);
    if (catMatch) {
      category = catMatch[1].trim();
      continue;
    }
    if (/^expects:\s*$/.test(line)) {
      let j = i + 1;
      for (; j < lines.length; j++) {
        const item = lines[j].match(/^\s*-\s*(.+)$/);
        if (!item) break;
        let val = item[1].trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        expects.push(val);
      }
      i = j - 1;
    }
  }
  return { category, expects, body: body.trim() };
}

function extractFromNdjson(stdout) {
  const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  let outputText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let sawTokens = false;
  let errorMsg = null;
  for (const line of lines) {
    let evt;
    try {
      evt = JSON.parse(line);
    } catch {
      continue; // stray non-JSON line (e.g. a plugin banner) - ignore it
    }
    if (evt.type === 'text' && evt.part && typeof evt.part.text === 'string') {
      outputText += evt.part.text;
    } else if (evt.type === 'step_finish' && evt.part && evt.part.tokens) {
      const t = evt.part.tokens;
      inputTokens += t.input || 0;
      outputTokens += (t.output || 0) + (t.reasoning || 0);
      sawTokens = true;
    } else if (evt.type === 'error' && evt.error) {
      errorMsg = (evt.error.data && evt.error.data.message) || evt.error.name || 'unknown error';
    }
  }
  return { outputText, inputTokens, outputTokens, sawTokens, errorMsg };
}

let pricingCache = null;
async function loadPricing() {
  if (pricingCache) return pricingCache;
  try {
    const raw = await readFile(path.join(__dirname, 'pricing.json'), 'utf8');
    pricingCache = JSON.parse(raw);
  } catch {
    pricingCache = {};
  }
  return pricingCache;
}

async function computeCost(model, inputTokens, outputTokens) {
  const pricing = await loadPricing();
  const p = pricing[model];
  if (!p || p.input_per_mtok == null || p.output_per_mtok == null) return null;
  const cost = (inputTokens / 1e6) * p.input_per_mtok + (outputTokens / 1e6) * p.output_per_mtok;
  return Math.round(cost * 1e6) / 1e6;
}

async function makeErrorResult(model, startedAt, message, promptBody) {
  const inputTokens = Math.ceil(promptBody.length / 4);
  return {
    model,
    latency_ms: Date.now() - startedAt,
    input_tokens: inputTokens,
    output_tokens: 0,
    token_source: 'estimated',
    cost_usd: await computeCost(model, inputTokens, 0),
    exit_code: null,
    timed_out: false,
    error: message,
    output_text: '',
  };
}

function runOnce(bin, model, promptBody, cwd, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(
        bin,
        ['run', '--model', model, '--format', 'json', '--dir', cwd, promptBody],
        { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (err) {
      resolve(makeErrorResult(model, startedAt, `failed to spawn "${bin}": ${err.message}`, promptBody));
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }, timeoutMs);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve(makeErrorResult(model, startedAt, `spawn error: ${err.message}`, promptBody));
    });

    child.on('close', async (code) => {
      clearTimeout(timer);
      const latency_ms = Date.now() - startedAt;
      const { outputText, inputTokens: reportedIn, outputTokens: reportedOut, sawTokens, errorMsg } =
        extractFromNdjson(stdout);

      let inputTokens = reportedIn;
      let outputTokens = reportedOut;
      let tokenSource = 'reported';
      if (!sawTokens) {
        tokenSource = 'estimated';
        inputTokens = Math.ceil(promptBody.length / 4);
        outputTokens = Math.ceil(outputText.length / 4);
      }

      let error = null;
      if (timedOut) error = `timed out after ${timeoutMs}ms`;
      else if (errorMsg) error = errorMsg;
      else if (code !== 0) error = stderr.trim().slice(0, 2000) || `opencode exited with code ${code}`;

      resolve({
        model,
        latency_ms,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        token_source: tokenSource,
        cost_usd: await computeCost(model, inputTokens, outputTokens),
        exit_code: code,
        timed_out: timedOut,
        error,
        output_text: outputText,
      });
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.models || !args.prompt) {
    console.log(HELP);
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const bin = process.env.OPENCODE_BIN || 'opencode';
  const promptPath = path.resolve(args.prompt);
  const raw = await readFile(promptPath, 'utf8');
  const { category, expects, body } = parsePromptFile(raw);
  const models = args.models.split(',').map((s) => s.trim()).filter(Boolean);
  if (models.length === 0) throw new Error('--models produced an empty list');
  const timeoutMs = Math.max(1, args.timeout) * 1000;
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });

  console.log(`opencode binary: ${bin}`);
  console.log(`category: ${category} (${path.relative(process.cwd(), promptPath)})`);
  console.log(`models: ${models.join(', ')}`);
  console.log(`timeout: ${args.timeout}s per model\n`);

  const results = [];
  for (const model of models) {
    process.stdout.write(`  -> ${model} ... `);
    const sandbox = await mkdtemp(path.join(os.tmpdir(), 'opencode-bench-'));
    try {
      const r = await runOnce(bin, model, body, sandbox, timeoutMs);
      results.push(r);
      console.log(
        r.error
          ? `FAILED (${r.error.slice(0, 100)})`
          : `ok - ${r.latency_ms}ms, ${r.input_tokens}in/${r.output_tokens}out (${r.token_source}), cost=${r.cost_usd ?? 'n/a'}`
      );
    } finally {
      await rm(sandbox, { recursive: true, force: true }).catch(() => {});
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(outDir, `${timestamp}-${category}.json`);
  const record = {
    generated_at: new Date().toISOString(),
    category,
    prompt_file: path.relative(REPO_ROOT, promptPath),
    expects,
    timeout_s: args.timeout,
    opencode_bin: bin,
    results,
  };
  await writeFile(outFile, JSON.stringify(record, null, 2));
  console.log(`\nWrote ${path.relative(process.cwd(), outFile)}`);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
