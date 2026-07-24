#!/usr/bin/env node
// Generates .agents/agents/oc-<role>/agent.md (native Antigravity custom
// agent files) from agents/<role>.md — same single-source model as the
// Claude Code and Codex mirrors. Zero npm dependencies (Node >= 20). See
// antigravity/README.md.
//
// Usage:
//   node scripts/sync-antigravity-agents.mjs [--profile personal|work] [--check]
//
// --check writes nothing and exits nonzero if any generated file under
// .agents/agents/ is stale or missing relative to its agents/*.md source
// (CI mode).
//
// Antigravity's own docs (https://antigravity.google/docs/subagents,
// https://antigravity.google/docs/cli/commands/agents — fetched
// 2026-07-22) confirm only `name`, `description`, and `model` as recognized
// custom-agent frontmatter, with `model` accepting only `flash`, `pro`, or
// `inherit`. There is no frontmatter equivalent for OpenCode's
// permission.task/permission.edit write/subagent-tool gating — that intent
// is expressed as a short prose note appended to the body instead (see
// WRITE_RESTRICTION_NOTE below), matching sync-agents.mjs's
// translate-what's-real-drop-the-rest discipline.
//
// Antigravity also requires each custom agent to live in its OWN dedicated
// subdirectory (agents/<name>/agent.md) — files placed directly under
// .agents/agents/ are not discovered. mkdir -p per role enforces that.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatterFile } from './lib/frontmatter.mjs';
import { TEAM_ROLES } from './lib/team.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// The only confirmed values for Antigravity custom-agent frontmatter
// `model:` (see file header). validate.mjs imports this to check committed
// files don't drift onto an invented tier name.
export const ANTIGRAVITY_MODEL_TIERS = ['flash', 'pro', 'inherit'];

// Antigravity model tier per agent. Carried over unchanged from the
// pre-existing antigravity/rules/engineering-team.md mapping (already
// confirmed-safe — every role there was already pro/inherit/flash, never
// the unconfirmed flash_lite). validate.mjs asserts this map covers exactly
// the six agents, same guard pattern as sync-agents.mjs's
// CLAUDE_MODEL_BY_AGENT.
export const ANTIGRAVITY_MODEL_BY_AGENT = {
  'tech-lead': 'pro',
  'senior-dev': 'pro',
  'implementer': 'inherit',
  'boilerplate': 'flash',
  'code-reviewer': 'pro',
  'debugger': 'pro',
};

// Antigravity has no frontmatter field for write/subagent-tool permission
// (see file header) — roles whose OpenCode source restricts direct edits
// get a short prose note appended to the body instead, worded to match the
// ACTUAL restriction rather than overstating it: agents/code-reviewer.md
// has `permission.edit: deny` (absolute — no write tools at all), but
// agents/tech-lead.md has `permission.edit: ask` (an escape hatch requiring
// confirmation, not a hard block) — see each source file's `permission:`
// block. Keep each note to one or two sentences; it is not a rewrite of
// the source body.
const WRITE_RESTRICTION_NOTE = {
  'tech-lead':
    '**Antigravity note:** the source OpenCode profile treats direct edits ' +
    'as an exception requiring confirmation (`permission.edit: ask`), not a ' +
    'hard block — you still orchestrate and delegate rather than write code ' +
    'yourself; edit directly only as a last resort.',
  'code-reviewer':
    '**Antigravity note:** this agent profile has no write tools enabled — ' +
    'you report findings; you never edit files.',
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
      console.error(`sync-antigravity-agents.mjs: unknown argument "${argv[i]}".`);
      process.exit(1);
    }
  }
  if (profile !== 'personal' && profile !== 'work') {
    console.error(`sync-antigravity-agents.mjs: --profile must be "personal" or "work", got "${profile}".`);
    process.exit(1);
  }
  return { profile, check };
}

function escapeYamlDoubleQuoted(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// Builds the full generated agent.md text for one role. Exported so
// validate.mjs can rebuild in-memory and detect stale committed files, and
// so it can be imported without triggering a sync run (see the main() gate
// at the bottom).
export function buildAgentMd(role, frontmatter, body, modelTier) {
  if (!TEAM_ROLES.includes(role)) {
    throw new Error(`"${role}" is not in the team roster (scripts/lib/team.mjs).`);
  }
  if (!ANTIGRAVITY_MODEL_TIERS.includes(modelTier)) {
    throw new Error(
      `${role}: model tier "${modelTier}" is not one of the confirmed Antigravity values ` +
        `(${ANTIGRAVITY_MODEL_TIERS.join('|')}).`
    );
  }
  const description = frontmatter.description;
  if (typeof description !== 'string' || !description) {
    throw new Error(`${role}: source frontmatter has no description.`);
  }

  const lines = [];
  lines.push('---');
  lines.push(`name: oc-${role}`);
  lines.push(`description: "${escapeYamlDoubleQuoted(description)}"`);
  lines.push(`model: ${modelTier}`);
  lines.push('---');

  const commentLines = [
    `<!-- GENERATED from agents/${role}.md by scripts/sync-antigravity-agents.mjs — do not hand-edit -->`,
    `<!-- model: ${modelTier} is a repo-assigned Antigravity tier (ANTIGRAVITY_MODEL_BY_AGENT in sync-antigravity-agents.mjs) — not from the OpenCode source, which is model-free by design. -->`,
  ];

  let outBody = body;
  const note = WRITE_RESTRICTION_NOTE[role];
  if (note) {
    // Normalize to exactly one trailing newline, then append the note as
    // its own paragraph, then restore a single trailing newline.
    outBody = outBody.replace(/\n+$/, '\n') + '\n' + note + '\n';
  }

  return lines.join('\n') + '\n' + commentLines.join('\n') + '\n' + outBody;
}

function main() {
  const { profile, check } = parseArgs(process.argv.slice(2));

  const agentsDir = path.join(REPO_ROOT, 'agents');
  const outBaseDir = path.join(REPO_ROOT, '.agents', 'agents');
  if (!fs.existsSync(agentsDir)) {
    console.error(`sync-antigravity-agents.mjs: agents/ directory does not exist at ${agentsDir}`);
    process.exit(1);
  }
  if (!check) fs.mkdirSync(outBaseDir, { recursive: true });

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md') && f !== '.gitkeep');
  if (files.length === 0) {
    console.error('sync-antigravity-agents.mjs: no agents/*.md source files found — nothing to sync.');
    process.exit(1);
  }

  let written = 0;
  let unchanged = 0;
  let stale = 0;
  for (const file of files) {
    const role = file.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const parsed = parseFrontmatterFile(raw);
    if (!parsed) {
      console.error(`sync-antigravity-agents.mjs: agents/${file} has no frontmatter block — skipping.`);
      continue;
    }

    if (!TEAM_ROLES.includes(role)) {
      console.error(
        `sync-antigravity-agents.mjs: agents/${file} is not in the team roster ` +
          `(scripts/lib/team.mjs: ${TEAM_ROLES.join(', ')}) — add it there first.`
      );
      process.exit(1);
    }
    const modelTier = ANTIGRAVITY_MODEL_BY_AGENT[role];
    if (!modelTier) {
      console.error(
        `sync-antigravity-agents.mjs: agents/${file} has no entry in ANTIGRAVITY_MODEL_BY_AGENT — add one.`
      );
      process.exit(1);
    }

    let output;
    try {
      output = buildAgentMd(role, parsed.frontmatter, parsed.body, modelTier);
    } catch (e) {
      console.error(`sync-antigravity-agents.mjs: ${e.message}`);
      process.exit(1);
    }

    const outDir = path.join(outBaseDir, `oc-${role}`);
    const outPath = path.join(outDir, 'agent.md');
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (existing === output) {
      unchanged++;
      continue;
    }
    if (check) {
      stale++;
      console.error(
        `sync-antigravity-agents.mjs: .agents/agents/oc-${role}/agent.md is ` +
          `${existing === null ? 'missing' : 'stale'} — re-run \`node scripts/sync-antigravity-agents.mjs\`.`
      );
      continue;
    }
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, output);
    written++;
  }

  if (check) {
    if (stale) {
      console.error(`sync-antigravity-agents.mjs --check: ${stale} file(s) out of date.`);
      process.exit(1);
    }
    console.log(`sync-antigravity-agents.mjs --check: all ${files.length} generated files up to date (profile=${profile}).`);
    return;
  }
  console.log(
    `sync-antigravity-agents.mjs: ${written} file(s) written, ${unchanged} unchanged, ` +
      `${files.length} source file(s) total (profile flag "${profile}" accepted for ` +
      `compatibility; mirror models are repo-pinned tiers).`
  );
}

// Gate direct execution so validate.mjs can import ANTIGRAVITY_MODEL_BY_AGENT
// / buildAgentMd without triggering a sync run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
