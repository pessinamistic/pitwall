#!/usr/bin/env node
// Generates agents/fleet/fleet-<role>.md — mode: primary, standalone
// variants of the six agents/*.md source roles, so fleet mode's opencode
// backend has a real primary agent to launch.
//
// THE BUG THIS FIXES (see docs/fleet-mode.md for the full empirical
// writeup): `opencode run --agent <name>` (confirmed against opencode
// 1.17.18 on the authoring machine) requires a primary-mode agent for a
// top-level CLI invocation. Only agents/tech-lead.md is `mode: primary`;
// the other five are `mode: subagent` by design — that's the enforcement
// mechanism for in-session tech-lead -> worker delegation (see README.md,
// "How orchestration is enforced") and is deliberately NOT changed here.
// Fleet mode bypasses that hierarchy on purpose, launching each role as its
// own top-level process — but a subagent-mode name given to `opencode run
// --agent` doesn't error, it silently falls back to the default agent
// ("build"), discarding the intended persona, permission restrictions, and
// model routing behind a single easy-to-miss warning line. This generator
// produces an ADDITIVE, distinctly-named `mode: primary` copy of each role
// instead — agents/*.md itself is never edited, and its `mode: subagent` /
// `permission.task: deny` stay exactly as-is for in-session delegation.
//
// Usage:
//   node scripts/sync-fleet-agents.mjs [--profile personal|work] [--check]
//
// --check writes nothing and exits nonzero if any generated file under
// agents/fleet/ is stale or missing relative to its agents/<role>.md
// source (CI mode). There is no separate CI line for this — its drift
// check is folded into `node scripts/validate.mjs --platform opencode`
// (which `--platform all` already runs), the same precedent
// sync-antigravity-agents.mjs set (see .github/workflows/ci.yml and
// docs/fleet-mode.md).
//
// What gets carried over, and how:
//   - Every frontmatter field is copied VERBATIM from the source except
//     `mode` (forced to "primary" here). In particular, permission.task,
//     permission.edit, and every bash pattern map are reproduced exactly —
//     the whole point of this generator is that a fleet-spawned worker
//     keeps its existing restrictions, not a loosened copy of them.
//   - The markdown body is copied byte-for-byte, unmodified. Contrast with
//     sync-codex-agents.mjs's CODEX_REWRITES: there is no equivalent list
//     here on purpose — fleet mode runs the SAME worker prompt outside the
//     tech-lead hierarchy, not a rewritten one.
//   - `description` is re-emitted as a single double-quoted line (same
//     transform sync-agents.mjs and sync-antigravity-agents.mjs already
//     apply to their own mirrors) rather than reproducing the source's
//     ">-" folded block-scalar style — semantically identical, just a
//     different (simpler, unambiguous) YAML spelling.
//   - No `model:` key is ever emitted, matching agents/*.md's own rule
//     (see docs/model-routing.md) — model routing for a fleet-spawned
//     worker instead comes from a matching `agent.fleet-<role>` entry in
//     config/opencode.<profile>.jsonc. This is a NEW requirement confirmed
//     empirically while building this generator: OpenCode's
//     `agent.<name>.model` config is keyed by the exact invoked agent
//     identifier, so `agent.fleet-<role>` does NOT inherit
//     `agent.<role>`'s entry just because the two share a body — without
//     its own entry, a fleet-spawned task would silently inherit whatever
//     top-level default `model` is set, not the role's intended tier.
//
// Placed in agents/fleet/ (a subdirectory, not a agents/*.md file) so the
// three existing platform generators — which each do a flat,
// non-recursive `fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))`
// — never see these files: a directory entry doesn't end in ".md", so
// their existing filter already skips it (confirmed by reading
// sync-agents.mjs, sync-codex-agents.mjs, and sync-antigravity-agents.mjs).
//
// Deployment: scripts/install.sh's opencode step additionally symlinks
// agents/fleet/*.md into ~/.config/opencode/agents/ (flat, alongside the
// six primary agents), and scripts/fleet/lib/common.sh's
// fleet_build_launch_cmd targets fleet-<role> instead of the bare role
// name for the opencode backend. The global agents directory is the
// reliable discovery path for fleet mode's actual usage pattern — a fleet
// task's tmux window cwd is wherever `pit-wall.sh spawn` was invoked from,
// which may be any project, not necessarily this repo's own checkout, so
// OpenCode's *project-local* `.opencode/agents/` directory (confirmed to
// also work, empirically) would only help on the narrower case of running
// fleet mode from inside this repo.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFrontmatterFile } from './lib/frontmatter.mjs';
import { yamlKey, yamlScalar, serializeYamlMapping, escapeYamlDoubleQuoted } from './lib/yaml-frontmatter.mjs';
import { TEAM_ROLES } from './lib/team.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// The one naming rule every consumer (this generator, validate.mjs, and
// scripts/fleet/lib/common.sh's fleet_build_launch_cmd) agrees on.
export function fleetAgentName(role) {
  return `fleet-${role}`;
}
export function fleetAgentFilename(role) {
  return `${fleetAgentName(role)}.md`;
}

// Never present on the source today (validate.mjs's validateAgents()
// already forbids both on agents/*.md) — dropped here too, belt-and-braces,
// so a future regression on the source side can't leak a model: or name:
// key into the generated fleet variant.
const FRONTMATTER_KEYS_TO_DROP = new Set(['model', 'name']);

// Builds the full generated agents/fleet/fleet-<role>.md text for one
// role. Pure function (no fs) so validate.mjs can rebuild in-memory and
// detect a stale or hand-edited committed file, the same pattern
// buildCodexToml/buildAgentMd use in the sibling generators.
export function buildFleetAgentMd(role, frontmatter, body) {
  if (!TEAM_ROLES.includes(role)) {
    throw new Error(`"${role}" is not in the team roster (scripts/lib/team.mjs).`);
  }
  if (!frontmatter || typeof frontmatter !== 'object') {
    throw new Error(`${role}: source frontmatter is missing or not an object.`);
  }
  const description = frontmatter.description;
  if (typeof description !== 'string' || !description) {
    throw new Error(`${role}: source frontmatter has no description.`);
  }
  if (!('mode' in frontmatter)) {
    throw new Error(`${role}: source frontmatter has no "mode" key to override.`);
  }
  if (typeof body !== 'string' || !body.trim()) {
    throw new Error(`${role}: source body is empty.`);
  }

  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (FRONTMATTER_KEYS_TO_DROP.has(key)) continue;
    if (key === 'mode') {
      lines.push('mode: primary');
      continue;
    }
    if (key === 'description') {
      lines.push(`description: "${escapeYamlDoubleQuoted(description)}"`);
      continue;
    }
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${yamlKey(key)}:`);
      lines.push(...serializeYamlMapping(value, 2));
      continue;
    }
    lines.push(`${yamlKey(key)}: ${yamlScalar(value)}`);
  }
  lines.push('---');

  const name = fleetAgentName(role);
  const commentLines = [
    `<!-- GENERATED from agents/${role}.md by scripts/sync-fleet-agents.mjs — do not hand-edit -->`,
    `<!-- mode: primary here (source is mode: ${JSON.stringify(frontmatter.mode)}) -- this file exists only so \`opencode run --agent ${name}\` (fleet mode's opencode backend) has a primary-mode agent to launch; see docs/fleet-mode.md. -->`,
    `<!-- Every other field (permission, temperature, steps, ...) and the body below are copied verbatim from agents/${role}.md -- edit the SOURCE file and re-run \`node scripts/sync-fleet-agents.mjs\`, never this file. -->`,
  ];

  return lines.join('\n') + '\n' + commentLines.join('\n') + '\n' + body;
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
      console.error(`sync-fleet-agents.mjs: unknown argument "${argv[i]}".`);
      process.exit(1);
    }
  }
  if (profile !== 'personal' && profile !== 'work') {
    console.error(`sync-fleet-agents.mjs: --profile must be "personal" or "work", got "${profile}".`);
    process.exit(1);
  }
  return { profile, check };
}

function main() {
  const { profile, check } = parseArgs(process.argv.slice(2));

  const agentsDir = path.join(REPO_ROOT, 'agents');
  const outDir = path.join(agentsDir, 'fleet');
  if (!fs.existsSync(agentsDir)) {
    console.error(`sync-fleet-agents.mjs: agents/ directory does not exist at ${agentsDir}`);
    process.exit(1);
  }
  if (!check) fs.mkdirSync(outDir, { recursive: true });

  let written = 0;
  let unchanged = 0;
  let stale = 0;
  for (const role of TEAM_ROLES) {
    const srcPath = path.join(agentsDir, `${role}.md`);
    if (!fs.existsSync(srcPath)) {
      console.error(`sync-fleet-agents.mjs: agents/${role}.md does not exist — add it first (see scripts/lib/team.mjs).`);
      process.exit(1);
    }
    const parsed = parseFrontmatterFile(fs.readFileSync(srcPath, 'utf8'));
    if (!parsed) {
      console.error(`sync-fleet-agents.mjs: agents/${role}.md has no frontmatter block — skipping.`);
      process.exit(1);
    }

    let output;
    try {
      output = buildFleetAgentMd(role, parsed.frontmatter, parsed.body);
    } catch (e) {
      console.error(`sync-fleet-agents.mjs: ${e.message}`);
      process.exit(1);
    }

    const outPath = path.join(outDir, fleetAgentFilename(role));
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : null;
    if (existing === output) {
      unchanged++;
      continue;
    }
    if (check) {
      stale++;
      console.error(
        `sync-fleet-agents.mjs: agents/fleet/${fleetAgentFilename(role)} is ${existing === null ? 'missing' : 'stale'} ` +
          `— re-run \`node scripts/sync-fleet-agents.mjs\`.`
      );
      continue;
    }
    fs.writeFileSync(outPath, output);
    written++;
  }

  if (check) {
    if (stale) {
      console.error(`sync-fleet-agents.mjs --check: ${stale} file(s) out of date.`);
      process.exit(1);
    }
    console.log(`sync-fleet-agents.mjs --check: all ${TEAM_ROLES.length} generated files up to date (profile=${profile}).`);
    return;
  }
  console.log(
    `sync-fleet-agents.mjs: profile=${profile} — ${written} file(s) written, ${unchanged} unchanged, ` +
      `${TEAM_ROLES.length} role(s) total (profile flag accepted for CLI compatibility; these files never carry a model: key).`
  );
}

// Gate direct execution so validate.mjs can import fleetAgentName /
// fleetAgentFilename / buildFleetAgentMd without triggering a sync run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
