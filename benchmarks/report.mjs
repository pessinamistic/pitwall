#!/usr/bin/env node
// benchmarks/report.mjs
//
// Reads one or more result JSON files produced by run.mjs and prints a
// markdown report to stdout: one table per task category, cheapest/fastest
// highlighted, and a Quality column that is either a count of objective
// `expects` assertions mechanically checked against the model's raw output
// text, or "manual review needed" - never an invented numeric score.
//
// Usage:
//   node benchmarks/report.mjs <result1.json> [result2.json ...]
//   node benchmarks/report.mjs --dir benchmarks/results/
//
// Zero npm dependencies. Node >= 20.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HELP = `
Usage: node benchmarks/report.mjs <result.json> [more.json ...]
       node benchmarks/report.mjs --dir benchmarks/results/

Reads result JSON files written by run.mjs and prints a markdown report
(grouped by task category) to stdout.
`;

function parseArgs(argv) {
  const files = [];
  let dir = null;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') dir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') help = true;
    else files.push(argv[i]);
  }
  return { files, dir, help };
}

// Grading DSL: an `expects` string wrapped in /.../ (optionally with trailing
// flags, e.g. /foo|bar/i) is a regex checked against the raw output text.
// Anything else is a plain case-insensitive substring match. This is a
// mechanical, zero-dependency, non-LLM grader - see README's caveat #2.
function buildChecker(expectStr) {
  if (expectStr.length > 1 && expectStr.startsWith('/')) {
    const lastSlash = expectStr.lastIndexOf('/');
    if (lastSlash > 0) {
      const source = expectStr.slice(1, lastSlash);
      let flags = expectStr.slice(lastSlash + 1);
      if (!flags.includes('i')) flags += 'i';
      try {
        const re = new RegExp(source, flags);
        return (text) => re.test(text);
      } catch {
        // malformed regex in the prompt file - fall back to a literal
        // substring match on the whole expectStr rather than crashing.
      }
    }
  }
  const needle = expectStr.toLowerCase();
  return (text) => text.toLowerCase().includes(needle);
}

function grade(record, expects) {
  if (!expects || expects.length === 0) {
    return 'manual review needed (no expects defined)';
  }
  if (record.error || !record.output_text || !record.output_text.trim()) {
    return 'manual review needed (no output to check)';
  }
  let passed = 0;
  for (const e of expects) {
    if (buildChecker(e)(record.output_text)) passed++;
  }
  return `${passed}/${expects.length} checks (auto)`;
}

function fmtCost(v) {
  if (v == null) return 'n/a';
  return `$${v.toFixed(6)}`;
}

function fmtNum(v) {
  return v == null ? 'n/a' : String(v);
}

function escapeCell(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

async function loadResultFiles({ files, dir }) {
  const paths = [...files];
  if (dir) {
    const entries = await readdir(dir);
    for (const e of entries.sort()) {
      if (e.endsWith('.json')) paths.push(path.join(dir, e));
    }
  }
  if (paths.length === 0) {
    throw new Error('No result files given. Pass file paths or --dir <results-dir>.');
  }
  const loaded = [];
  for (const p of paths) {
    const raw = await readFile(p, 'utf8');
    loaded.push({ file: p, data: JSON.parse(raw) });
  }
  return loaded;
}

async function loadDisclaimer() {
  try {
    const raw = await readFile(path.join(__dirname, 'pricing.json'), 'utf8');
    return JSON.parse(raw)._disclaimer || null;
  } catch {
    return null;
  }
}

function renderCategoryTable(category, expects, records) {
  const lines = [];
  lines.push(`## ${category}`);
  lines.push('');

  const okCosts = records.filter((r) => !r.error && r.cost_usd != null);
  const okLatencies = records.filter((r) => !r.error && r.exit_code === 0);
  const cheapest = okCosts.length
    ? okCosts.reduce((a, b) => (b.cost_usd < a.cost_usd ? b : a))
    : null;
  const fastest = okLatencies.length
    ? okLatencies.reduce((a, b) => (b.latency_ms < a.latency_ms ? b : a))
    : null;

  lines.push('| Model | Latency (ms) | Tokens in/out | Token source | Est. cost | Quality | Notes |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of records) {
    const tags = [];
    if (cheapest && r === cheapest) tags.push('cheapest');
    if (fastest && r === fastest) tags.push('fastest');
    const modelCell = tags.length ? `**${escapeCell(r.model)}** _(${tags.join(', ')})_` : escapeCell(r.model);
    let notes = '';
    if (r.error) notes = `error: ${escapeCell(r.error).slice(0, 150)}`;
    else if (r.timed_out) notes = 'timed out';
    lines.push(
      `| ${modelCell} | ${fmtNum(r.latency_ms)} | ${fmtNum(r.input_tokens)} / ${fmtNum(r.output_tokens)} | ${r.token_source} | ${fmtCost(r.cost_usd)} | ${grade(r, expects)} | ${notes} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return;
  }
  const loaded = await loadResultFiles(args);
  const disclaimer = await loadDisclaimer();

  const byCategory = new Map();
  for (const { data } of loaded) {
    const category = data.category || 'unknown';
    if (!byCategory.has(category)) {
      byCategory.set(category, { expects: data.expects || [], records: [] });
    }
    const bucket = byCategory.get(category);
    for (const r of data.results || []) bucket.records.push(r);
  }

  const out = [];
  out.push('# Model cost / quality benchmark report');
  out.push('');
  out.push(
    '> Cross-provider cost comparison only means something on the work machine, ' +
    'where GitHub Copilot models are actually reachable - see benchmarks/README.md.'
  );
  out.push('');
  if (disclaimer) {
    out.push(`> **Caveat 1 (cost is a proxy, not a bill):** ${disclaimer}`);
    out.push('>');
  }
  out.push(
    '> **Caveat 2 (quality is not a score):** the Quality column counts objective ' +
    '`expects` assertions from the prompt file, checked mechanically (regex/substring ' +
    'match against the model\'s raw output text) - it is not an LLM judge and not a ' +
    '0-100 score. Rows with no usable output show "manual review needed" instead of a ' +
    'fabricated number.'
  );
  out.push('');

  for (const [category, { expects, records }] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    out.push(renderCategoryTable(category, expects, records));
  }

  console.log(out.join('\n'));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exitCode = 1;
});
