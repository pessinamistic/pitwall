#!/usr/bin/env node
// Generates .claude/agents/*.md from agents/*.md (see README.md,
// "Claude Code mirrors"). Zero npm dependencies (Node >= 20).
//
// Usage:
//   node scripts/sync-agents.mjs [--profile personal|work] [--check]
//
// --check writes nothing and exits nonzero if any generated mirror under
// .claude/agents/ is stale or missing relative to its agents/*.md source
// (CI mode).
//
// The OpenCode agent files carry no `model:` key by design (see
// docs/model-routing.md) — OpenCode routing lives only in
// config/opencode.<profile>.jsonc. The generated Claude Code mirrors are
// different: Claude Code runs on a fixed subscription model set, so each
// mirror gets a HARDCODED model alias from CLAUDE_MODEL_BY_AGENT below,
// pinned at generation time. The --profile flag is retained for CLI
// compatibility (install.sh passes it) but no longer affects model
// assignment.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatterFile } from './lib/frontmatter.mjs';
import { TEAM_ROLES } from './lib/team.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// Claude Code model alias per agent, by tier. Aliases (not dated full IDs)
// so the mirrors don't rot as model versions roll forward. Verified against
// the Claude Code docs (code.claude.com/docs: sub-agents "Configuration
// fields" + model-config "Model aliases"): the subagent `model:` field
// accepts `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`
// (the default when omitted). `fable` is the tier above `opus` ("Claude
// Fable 5 for your hardest and longest-running tasks"; the `best` alias
// resolves to Fable 5 where available, else latest Opus) — so `fable` is
// the top tier here. If an org's model allowlist excludes it, Claude Code
// documented behavior is to skip the value and run on the inherited model.
//
// validate.mjs asserts this map covers exactly the six agents, so a
// seventh agent can't silently ship an untier'd (inherit-model) mirror.
export const CLAUDE_MODEL_BY_AGENT = {
  'tech-lead': 'fable',       // strongest — planning/routing quality dominates cost
  'senior-dev': 'fable',      // strongest — design, security, schema, concurrency
  'implementer': 'sonnet',    // mid — well-briefed feature work
  'boilerplate': 'haiku',     // cheapest — mechanical work only
  'code-reviewer': 'sonnet',  // mid — fault-finding on a fixed diff
  'debugger': 'sonnet',       // mid — root-cause isolation
};

// A representative "full" Claude Code subagent toolset. Used only to
// translate shorthand permission denies into a `tools:` allowlist that
// excludes the denied tools. This list is a design choice (Claude Code has
// no single canonical "all tools" frontmatter constant to subtract from) —
// adjust it here if the real default toolset differs.
const DEFAULT_CLAUDE_TOOLS = [
  'Task',
  'Bash',
  'Glob',
  'Grep',
  'Read',
  'Edit',
  'Write',
  'NotebookEdit',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
];
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit'];

// A shorthand `deny` on these permission keys maps directly onto Claude
// Code tool names, so it IS translatable: omit the mapped tool(s) from the
// generated `tools:` allowlist. Pattern-map values (e.g. code-reviewer's
// bash rules) and `ask`/`allow` shorthands stay untranslatable and are
// dropped with a note instead.
const SHORTHAND_DENY_TOOL_MAP = {
  edit: WRITE_TOOLS,
  task: ['Task'],
  webfetch: ['WebFetch'],
  websearch: ['WebSearch'],
};

function parseArgs(argv) {
  let profile = 'personal';
  let check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--profile') {
      profile = argv[i + 1];
      i++;
    } else if (argv[i].startsWith('--profile=')) {
      profile = argv[i].slice('--profile='.length);
    } else if (argv[i] === '--check') {
      check = true;
    } else {
      console.error(`sync-agents.mjs: unknown argument "${argv[i]}".`);
      process.exit(1);
    }
  }
  if (profile !== 'personal' && profile !== 'work') {
    console.error(`sync-agents.mjs: --profile must be "personal" or "work", got "${profile}".`);
    process.exit(1);
  }
  return { profile, check };
}

function escapeYamlDoubleQuoted(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Builds the `tools:` line (or null) and the HTML comment lines documenting
// what permission info could not be translated, from the source agent's
// `permission` block.
function translatePermission(permission) {
  if (!permission || typeof permission !== 'object') {
    return { toolsLine: null, notes: [] };
  }
  const notes = [];

  // 1. Translatable: shorthand denies with a direct tool equivalent.
  const translatedKeys = [];
  const deniedTools = [];
  for (const [key, tools] of Object.entries(SHORTHAND_DENY_TOOL_MAP)) {
    if (permission[key] === 'deny') {
      translatedKeys.push(key);
      deniedTools.push(...tools);
    }
  }
  let toolsLine = null;
  if (deniedTools.length) {
    const allowed = DEFAULT_CLAUDE_TOOLS.filter((t) => !deniedTools.includes(t));
    toolsLine = `tools: ${allowed.join(', ')}`;
    for (const key of translatedKeys) {
      notes.push(
        `permission.${key}: deny -> translated to the `
        + '`tools:`'
        + ` line above (omits ${SHORTHAND_DENY_TOOL_MAP[key].join('/')}).`
      );
    }
  }

  // 2. Untranslatable, called out individually so the comment only claims
  //    "no equivalent" for things that truly have none.
  if (permission.edit === 'ask') {
    notes.push('permission.edit: ask has no Claude Code frontmatter equivalent (no per-tool "confirm" mode) — dropped.');
  }
  const untranslated = Object.keys(permission).filter(
    (k) => !translatedKeys.includes(k) && !(k === 'edit' && permission.edit === 'ask')
  );
  if (untranslated.length) {
    notes.push(
      `permission.${untranslated.join(', permission.')}: no Claude Code frontmatter equivalent ` +
        `(pattern-map rules and allow/ask shorthands aren't expressible here) — dropped.`
    );
  }
  return { toolsLine, notes };
}

function buildGeneratedFile(sourceName, frontmatter, body, modelAlias) {
  const lines = [];
  lines.push('---');
  lines.push(`name: ${sourceName}`);
  const description = typeof frontmatter.description === 'string' ? frontmatter.description : '';
  lines.push(`description: "${escapeYamlDoubleQuoted(description)}"`);

  const { toolsLine, notes } = translatePermission(frontmatter.permission);
  if (toolsLine) lines.push(toolsLine);
  lines.push(`model: ${modelAlias}`);
  // mode, permission, steps, top_p, temperature, and color are all dropped
  // -- Claude Code subagent frontmatter doesn't recognize them.
  lines.push('---');

  const commentLines = [
    `<!-- GENERATED from agents/${sourceName}.md by scripts/sync-agents.mjs — do not hand-edit -->`,
    `<!-- model: ${modelAlias} is a repo-assigned Claude Code tier (CLAUDE_MODEL_BY_AGENT in sync-agents.mjs) — not from the OpenCode source, which is model-free by design. -->`,
  ];
  for (const note of notes) {
    commentLines.push(`<!-- ${note} -->`);
  }

  return lines.join('\n') + '\n' + commentLines.join('\n') + '\n' + body;
}

function main() {
  const { profile, check } = parseArgs(process.argv.slice(2));

  const agentsDir = path.join(REPO_ROOT, 'agents');
  const outDir = path.join(REPO_ROOT, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) {
    console.error(`sync-agents.mjs: agents/ directory does not exist at ${agentsDir}`);
    process.exit(1);
  }
  if (!check) fs.mkdirSync(outDir, { recursive: true });

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== '.gitkeep');
  if (files.length === 0) {
    console.error('sync-agents.mjs: no agents/*.md source files found — nothing to sync.');
    process.exit(1);
  }

  let written = 0;
  let unchanged = 0;
  let stale = 0;
  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const parsed = parseFrontmatterFile(raw);
    if (!parsed) {
      console.error(`sync-agents.mjs: agents/${file} has no frontmatter block — skipping.`);
      continue;
    }

    if (!TEAM_ROLES.includes(name)) {
      console.error(
        `sync-agents.mjs: agents/${file} is not in the team roster ` +
          `(scripts/lib/team.mjs: ${TEAM_ROLES.join(', ')}) — add it there first.`
      );
      process.exit(1);
    }
    const modelAlias = CLAUDE_MODEL_BY_AGENT[name];
    if (!modelAlias) {
      // An unmapped agent would ship with no model: line, i.e. `inherit` —
      // the silent-expensive-model failure mode this repo exists to avoid.
      console.error(
        `sync-agents.mjs: agents/${file} has no entry in CLAUDE_MODEL_BY_AGENT — add one ` +
          `(an unmapped mirror would default to model: inherit).`
      );
      process.exit(1);
    }

    const output = buildGeneratedFile(name, parsed.frontmatter, parsed.body, modelAlias);
    const outPath = path.join(outDir, file);
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (existing === output) {
      unchanged++;
      continue;
    }
    if (check) {
      stale++;
      console.error(
        `sync-agents.mjs: .claude/agents/${file} is ${existing === null ? 'missing' : 'stale'} ` +
          `— re-run \`node scripts/sync-agents.mjs\`.`
      );
      continue;
    }
    fs.writeFileSync(outPath, output);
    written++;
  }

  if (check) {
    if (stale) {
      console.error(`sync-agents.mjs --check: ${stale} file(s) out of date.`);
      process.exit(1);
    }
    console.log(`sync-agents.mjs --check: all ${files.length} generated files up to date (profile=${profile}).`);
    return;
  }
  console.log(
    `sync-agents.mjs: ${written} file(s) written, ${unchanged} unchanged, ` +
      `${files.length} source file(s) total (profile flag "${profile}" accepted for ` +
      `compatibility; mirror models are repo-pinned tiers).`
  );
}

// Gate direct execution so validate.mjs can import CLAUDE_MODEL_BY_AGENT
// without triggering a sync run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
