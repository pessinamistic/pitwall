#!/usr/bin/env node
// Generates .codex/agents/<role>.toml (native Codex CLI custom agents) from
// agents/<role>.md — same single-source model as the Claude mirrors. Zero
// npm dependencies (Node >= 20). See docs/codex.md.
//
// Usage:
//   node scripts/sync-codex-agents.mjs [--profile personal|work] [--check]
//
// Model / reasoning-effort / sandbox values come from
// config/codex.<profile>.jsonc (generator input — Codex never reads that
// file). "TODO" models are omitted from the generated TOML so the role
// inherits the parent session's model rather than shipping a fake slug.
// --check writes nothing and exits nonzero if any generated file is stale
// or missing (CI mode).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatterFile } from './lib/frontmatter.mjs';
import { parseJsonc } from './lib/jsonc.mjs';
import { tomlBasicString, tomlMultilineBasicString } from './lib/toml.mjs';
import { TEAM_ROLES } from './lib/team.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const CODEX_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];
export const CODEX_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'];

// Deterministic, minimal rewrites of platform-specific phrasing that would
// mislead inside Codex. Applied to the markdown body wherever present —
// everything else is preserved byte-for-byte. Keep this list short and
// literal; a rewrite that needs context does not belong here.
export const CODEX_REWRITES = [
  // Codex reads AGENTS.md, not CLAUDE.md.
  ['CLAUDE.md', 'AGENTS.md'],
  // OpenCode workers are one-shot; Codex agents run in resumable threads
  // (they still see nothing of the parent conversation).
  [
    'Worker agents are **stateless**: they see only the prompt you write',
    'Worker agents run in separate threads: they see only the brief you write',
  ],
  // "the Task tool" is OpenCode/Claude vocabulary; Codex resumes threads.
  ['invoke it again through the Task tool', 'resume its agent thread'],
];

export function loadCodexProfile(profile) {
  const file = path.join(REPO_ROOT, 'config', `codex.${profile}.jsonc`);
  if (!fs.existsSync(file)) {
    throw new Error(`config/codex.${profile}.jsonc does not exist.`);
  }
  const obj = parseJsonc(fs.readFileSync(file, 'utf8'));
  if (!obj.agent || typeof obj.agent !== 'object') {
    throw new Error(`config/codex.${profile}.jsonc: missing top-level "agent" block.`);
  }
  return obj.agent;
}

export function applyCodexRewrites(body) {
  let out = body;
  const applied = [];
  for (const [from, to] of CODEX_REWRITES) {
    if (out.includes(from)) {
      out = out.split(from).join(to);
      applied.push(from);
    }
  }
  return { body: out, applied };
}

// Builds the full generated TOML text for one role. Exported so
// validate.mjs can rebuild in-memory and detect stale committed files.
export function buildCodexToml(role, frontmatter, body, profileEntry) {
  if (!TEAM_ROLES.includes(role)) {
    throw new Error(`"${role}" is not in the team roster (scripts/lib/team.mjs).`);
  }
  const entry = profileEntry || {};
  if (entry.model_reasoning_effort && !CODEX_EFFORTS.includes(entry.model_reasoning_effort)) {
    throw new Error(
      `${role}: model_reasoning_effort "${entry.model_reasoning_effort}" is not one of the ` +
        `documented values (${CODEX_EFFORTS.join(', ')}).`
    );
  }
  if (entry.sandbox_mode && !CODEX_SANDBOX_MODES.includes(entry.sandbox_mode)) {
    throw new Error(
      `${role}: sandbox_mode "${entry.sandbox_mode}" is not one of ${CODEX_SANDBOX_MODES.join(', ')}.`
    );
  }

  const description = frontmatter.description;
  if (typeof description !== 'string' || !description) {
    throw new Error(`${role}: source frontmatter has no description.`);
  }
  const { body: rewritten, applied } = applyCodexRewrites(body);
  const instructions = rewritten.replace(/^\n+/, '').replace(/\n+$/, '\n');

  const lines = [];
  lines.push(`# GENERATED from agents/${role}.md by scripts/sync-codex-agents.mjs — do not hand-edit.`);
  lines.push('# Edit the source prompt or config/codex.<profile>.jsonc and re-run the generator.');
  if (applied.length) {
    lines.push('# Platform-specific phrasing adapted for Codex (see CODEX_REWRITES in the generator).');
  }
  lines.push('');
  lines.push(`name = ${tomlBasicString(role)}`);
  lines.push(`description = ${tomlBasicString(description)}`);
  if (entry.model && entry.model !== 'TODO') {
    lines.push(`model = ${tomlBasicString(entry.model)}`);
  } else if (entry.model === 'TODO') {
    lines.push('# model omitted: profile value is still TODO — the role inherits the parent');
    lines.push('# session model until config/codex.<profile>.jsonc is filled in.');
  }
  if (entry.model_reasoning_effort) {
    lines.push(`model_reasoning_effort = ${tomlBasicString(entry.model_reasoning_effort)}`);
  }
  if (entry.sandbox_mode) {
    lines.push(`sandbox_mode = ${tomlBasicString(entry.sandbox_mode)}`);
  }
  lines.push(`developer_instructions = ${tomlMultilineBasicString(instructions)}`);
  return lines.join('\n') + '\n';
}

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
      console.error(`sync-codex-agents.mjs: unknown argument "${argv[i]}".`);
      process.exit(1);
    }
  }
  if (profile !== 'personal' && profile !== 'work') {
    console.error(`sync-codex-agents.mjs: --profile must be "personal" or "work", got "${profile}".`);
    process.exit(1);
  }
  return { profile, check };
}

function main() {
  const { profile, check } = parseArgs(process.argv.slice(2));
  let profileAgents;
  try {
    profileAgents = loadCodexProfile(profile);
  } catch (e) {
    console.error(`sync-codex-agents.mjs: ${e.message}`);
    process.exit(1);
  }

  const agentsDir = path.join(REPO_ROOT, 'agents');
  const outDir = path.join(REPO_ROOT, '.codex', 'agents');
  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== '.gitkeep');
  if (files.length === 0) {
    console.error('sync-codex-agents.mjs: no agents/*.md source files found.');
    process.exit(1);
  }
  if (!check) fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  let unchanged = 0;
  let stale = 0;
  for (const file of files) {
    const role = file.replace(/\.md$/, '');
    const parsed = parseFrontmatterFile(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
    if (!parsed) {
      console.error(`sync-codex-agents.mjs: agents/${file} has no frontmatter block.`);
      process.exit(1);
    }
    let output;
    try {
      output = buildCodexToml(role, parsed.frontmatter, parsed.body, profileAgents[role]);
    } catch (e) {
      console.error(`sync-codex-agents.mjs: ${e.message}`);
      process.exit(1);
    }
    const outPath = path.join(outDir, `${role}.toml`);
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (existing === output) {
      unchanged++;
      continue;
    }
    if (check) {
      stale++;
      console.error(
        `sync-codex-agents.mjs: .codex/agents/${role}.toml is ${existing === null ? 'missing' : 'stale'} ` +
          `— re-run \`node scripts/sync-codex-agents.mjs --profile ${profile}\`.`
      );
      continue;
    }
    fs.writeFileSync(outPath, output);
    written++;
  }

  if (check) {
    if (stale) {
      console.error(`sync-codex-agents.mjs --check: ${stale} file(s) out of date.`);
      process.exit(1);
    }
    console.log(`sync-codex-agents.mjs --check: all ${files.length} generated files up to date (profile=${profile}).`);
    return;
  }
  console.log(
    `sync-codex-agents.mjs: profile=${profile} — ${written} file(s) written, ${unchanged} unchanged, ` +
      `${files.length} source file(s) total.`
  );
}

// Gate direct execution so validate.mjs can import the builder without
// triggering a sync run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
