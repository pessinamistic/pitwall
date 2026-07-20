#!/usr/bin/env node
// Validates the repo's agent/skill/config contract before it's synced or
// installed. Zero npm dependencies (Node >= 20 required). See README.md
// and docs/model-routing.md for the rules this enforces.
//
// Usage: node scripts/validate.mjs [--platform all|opencode|claude|codex]
//   all (default) runs everything; a specific platform runs the shared
//   source checks plus that platform's config/generated-file checks.
//
// Exit code is non-zero if any error was found. Warnings do not fail the
// run but are printed.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFrontmatterFile } from './lib/frontmatter.mjs';
import { parseJsonc } from './lib/jsonc.mjs';
import { CLAUDE_MODEL_BY_AGENT } from './sync-agents.mjs';
import { TEAM_ROLES, WORKER_ROLES } from './lib/team.mjs';
import {
  buildCodexToml,
  loadCodexProfile,
  CODEX_EFFORTS,
  CODEX_SANDBOX_MODES,
} from './sync-codex-agents.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const PLATFORMS = ['all', 'opencode', 'claude', 'codex'];
let PLATFORM = 'all';
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--platform') {
      PLATFORM = argv[i + 1];
      i++;
    } else if (argv[i].startsWith('--platform=')) {
      PLATFORM = argv[i].slice('--platform='.length);
    } else {
      console.error(`validate.mjs: unknown argument "${argv[i]}".`);
      process.exit(1);
    }
  }
  if (!PLATFORMS.includes(PLATFORM)) {
    console.error(`validate.mjs: --platform must be one of ${PLATFORMS.join('|')}, got "${PLATFORM}".`);
    process.exit(1);
  }
}
const wants = (platform) => PLATFORM === 'all' || PLATFORM === platform;


// Every permission key that accepts a shorthand ("allow"/"ask"/"deny") OR a
// pattern map.
const PATTERN_MAP_PERMISSION_KEYS = [
  'read',
  'edit',
  'glob',
  'grep',
  'list',
  'bash',
  'task',
  'external_directory',
  'lsp',
  'skill',
];

// Forbidden substrings, built by concatenation so this file's own source
// never contains either literal contiguously — otherwise check (g) would
// flag validate.mjs itself every time it scans scripts/.
const FORBIDDEN_USERNAME = ['pessin', 'amistic'].join('');
const FORBIDDEN_HOME_PREFIX = ['/', 'Users', '/'].join('');
const FORBIDDEN_PLAN_REF = ['IMPLEMENTATION', '_PLAN'].join('');

const errors = [];
const warnings = [];

function error(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

// ---------------------------------------------------------------------
// (a)(b)(c) agents/*.md
// ---------------------------------------------------------------------

function validateAgents() {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  if (!fs.existsSync(agentsDir)) {
    error(`agents/ directory does not exist at ${agentsDir}`);
    return;
  }

  const files = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md') && f !== '.gitkeep');
  const namesFound = new Set(files.map((f) => f.replace(/\.md$/, '')));

  for (const expected of TEAM_ROLES) {
    if (!namesFound.has(expected)) {
      error(`agents/${expected}.md is missing (see the six-agent roster in README.md).`);
    }
  }
  for (const name of namesFound) {
    if (!TEAM_ROLES.includes(name)) {
      error(
        `agents/${name}.md is not one of the six agents this repo specifies ` +
          `(see README.md): ${TEAM_ROLES.join(', ')}.`
      );
    }
  }

  for (const file of files) {
    const name = file.replace(/\.md$/, '');
    const full = path.join(agentsDir, file);
    const raw = readFile(full);
    let parsed;
    try {
      parsed = parseFrontmatterFile(raw);
    } catch (e) {
      error(`agents/${file}: failed to parse frontmatter — ${e.message}`);
      continue;
    }
    if (!parsed) {
      error(`agents/${file}: no frontmatter block found (must start with "---" at byte 0).`);
      continue;
    }
    const fm = parsed.frontmatter;

    // (a) required keys present; forbidden keys absent.
    if (!('description' in fm) || !fm.description) {
      error(`agents/${file}: frontmatter is missing a non-empty "description".`);
    }
    if (!('mode' in fm) || !fm.mode) {
      error(`agents/${file}: frontmatter is missing "mode".`);
    }
    if ('model' in fm) {
      error(
        `agents/${file}: frontmatter contains a "model:" key. Model routing must ` +
          `live only in config/opencode.<profile>.jsonc (see docs/model-routing.md) — a model ` +
          `key here would make the agent non-portable between profiles.`
      );
    }
    if ('name' in fm) {
      error(
        `agents/${file}: frontmatter contains a "name:" key, which OpenCode ignores ` +
          `(the filename is authoritative). Remove it to avoid the false impression it does anything.`
      );
    }

    // (b) "*" must be the first key in every permission pattern map.
    if (fm.permission && typeof fm.permission === 'object') {
      for (const key of PATTERN_MAP_PERMISSION_KEYS) {
        const val = fm.permission[key];
        if (val && typeof val === 'object') {
          const keys = Object.keys(val);
          if (keys.includes('*') && keys[0] !== '*') {
            error(
              `agents/${file}: permission.${key} has a "*" pattern but it is not ` +
                `first (found at position ${keys.indexOf('*') + 1} of ${keys.length}). ` +
                `Rules are last-match-wins (see README.md) — "*" must come first or it ` +
                `silently overrides every specific rule after it.`
            );
          }
        }
      }
    }

    // (c) mode / task / edit expectations per role.
    if (name === 'tech-lead') {
      if (fm.mode !== 'primary') {
        error(`agents/tech-lead.md: mode must be "primary", found ${JSON.stringify(fm.mode)}.`);
      }
    } else if (TEAM_ROLES.includes(name)) {
      if (fm.mode !== 'subagent') {
        error(`agents/${file}: mode must be "subagent", found ${JSON.stringify(fm.mode)}.`);
      }
    }
    if (WORKER_ROLES.includes(name)) {
      const taskPerm = fm.permission && fm.permission.task;
      if (taskPerm !== 'deny') {
        error(
          `agents/${file}: worker agents must have permission.task: deny (see "How ` +
            `orchestration is enforced" in README.md), found ${JSON.stringify(taskPerm)}.`
        );
      }
    }
    if (name === 'code-reviewer') {
      const editPerm = fm.permission && fm.permission.edit;
      if (editPerm !== 'deny') {
        error(
          `agents/code-reviewer.md: permission.edit must be deny (a reviewer that can ` +
            `edit silently fixes instead of reporting — see README.md), found ${JSON.stringify(editPerm)}.`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------
// (d) .claude/skills/*/SKILL.md
// ---------------------------------------------------------------------

function validateSkills() {
  const skillsDir = path.join(REPO_ROOT, '.claude', 'skills');
  if (!fs.existsSync(skillsDir)) {
    error(`.claude/skills/ directory does not exist at ${skillsDir}`);
    return;
  }
  const entries = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  if (entries.length === 0) {
    warn('.claude/skills/ contains no skill directories yet.');
    return;
  }
  for (const entry of entries) {
    const dirName = entry.name;
    const dirPath = path.join(skillsDir, dirName);
    const filesHere = fs.readdirSync(dirPath);
    const exact = filesHere.includes('SKILL.md');
    if (!exact) {
      const wrongCase = filesHere.find((f) => f.toLowerCase() === 'skill.md');
      if (wrongCase) {
        error(
          `.claude/skills/${dirName}/${wrongCase}: must be named literally "SKILL.md" ` +
            `(all caps) — OpenCode silently fails to discover any other casing (see docs/adding-a-skill.md).`
        );
      } else {
        error(`.claude/skills/${dirName}/ has no SKILL.md.`);
      }
      continue;
    }
    const full = path.join(dirPath, 'SKILL.md');
    const raw = readFile(full);
    let parsed;
    try {
      parsed = parseFrontmatterFile(raw);
    } catch (e) {
      error(`.claude/skills/${dirName}/SKILL.md: failed to parse frontmatter — ${e.message}`);
      continue;
    }
    if (!parsed) {
      error(`.claude/skills/${dirName}/SKILL.md: no frontmatter block found.`);
      continue;
    }
    const fm = parsed.frontmatter;
    if (typeof fm.name !== 'string' || fm.name === '') {
      error(`.claude/skills/${dirName}/SKILL.md: frontmatter is missing "name".`);
    } else {
      if (fm.name !== dirName) {
        error(
          `.claude/skills/${dirName}/SKILL.md: frontmatter name "${fm.name}" does not match ` +
            `its directory name "${dirName}" (docs/adding-a-skill.md requires equality).`
        );
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name)) {
        error(
          `.claude/skills/${dirName}/SKILL.md: name "${fm.name}" does not match ` +
            `^[a-z0-9]+(-[a-z0-9]+)*$.`
        );
      }
    }
    if (typeof fm.description !== 'string' || fm.description.length < 1 || fm.description.length > 1024) {
      error(
        `.claude/skills/${dirName}/SKILL.md: description must be 1-1024 chars, found ` +
          `${typeof fm.description === 'string' ? fm.description.length : 'missing'}.`
      );
    }
  }
}

// ---------------------------------------------------------------------
// (e)(f) config/opencode.{personal,work}.jsonc
// ---------------------------------------------------------------------

function loadOpencodeModels() {
  try {
    const result = spawnSync('opencode', ['models'], { encoding: 'utf8' });
    if (result.error) {
      if (result.error.code === 'ENOENT') return { available: false };
      return { available: false, spawnError: result.error };
    }
    if (result.status !== 0) {
      return { available: false, spawnError: new Error(`opencode models exited ${result.status}: ${result.stderr}`) };
    }
    const ids = result.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    return { available: true, ids: new Set(ids) };
  } catch (e) {
    if (e && e.code === 'ENOENT') return { available: false };
    return { available: false, spawnError: e };
  }
}

function validateConfigProfile(fileName, { isPersonal }) {
  const full = path.join(REPO_ROOT, 'config', fileName);
  if (!fs.existsSync(full)) {
    error(`config/${fileName} does not exist.`);
    return null;
  }
  const raw = readFile(full);
  let obj;
  try {
    obj = parseJsonc(raw);
  } catch (e) {
    error(`config/${fileName}: failed to parse as JSONC — ${e.message}`);
    return null;
  }
  if (!obj.agent || typeof obj.agent !== 'object') {
    error(`config/${fileName}: missing top-level "agent" block.`);
    return null;
  }

  const modelsByAgent = {};
  for (const agentName of TEAM_ROLES) {
    const entry = obj.agent[agentName];
    if (!entry || typeof entry !== 'object' || typeof entry.model !== 'string' || entry.model === '') {
      // This is the sharpest gotcha in the whole setup (see docs/model-routing.md): a missing
      // model entry does not error at runtime, it silently means "inherit
      // the tech lead's model." Fail loudly here instead.
      error(
        `config/${fileName}: agent.${agentName}.model is missing. An unset model does ` +
          `NOT mean "use a default" — it means this worker silently inherits the tech ` +
          `lead's (most expensive) model at runtime (see docs/model-routing.md).`
      );
      continue;
    }
    modelsByAgent[agentName] = entry.model;
    if (entry.model === 'TODO') {
      if (isPersonal) {
        error(`config/${fileName}: agent.${agentName}.model is still "TODO" — this profile ships as a real working config, not a template (see docs/model-routing.md).`);
      } else {
        warn(`config/${fileName}: agent.${agentName}.model is still "TODO" — fill it with a verbatim ID from \`opencode models\` on the work machine before using this profile (see docs/model-routing.md for the procedure).`);
      }
    }
  }

  if (!obj.agent.plan || typeof obj.agent.plan.model !== 'string' || obj.agent.plan.model === '') {
    warn(
      `config/${fileName}: agent.plan.model is not set. The built-in "plan" agent will ` +
        `inherit the default model rather than the cheap one the profile intends (see docs/model-routing.md).`
    );
  } else if (obj.agent.plan.model === 'TODO') {
    if (isPersonal) {
      error(`config/${fileName}: agent.plan.model is still "TODO".`);
    } else {
      warn(`config/${fileName}: agent.plan.model is still "TODO" — fill it on the work machine (see docs/model-routing.md for the procedure).`);
    }
  }

  return { obj, modelsByAgent };
}

function validateConfigs() {
  const personal = validateConfigProfile('opencode.personal.jsonc', { isPersonal: true });
  validateConfigProfile('opencode.work.jsonc', { isPersonal: false });

  if (personal) {
    const modelsResult = loadOpencodeModels();
    if (!modelsResult.available) {
      warn(
        'Skipping model-ID verification against `opencode models` — the binary is not ' +
          'on PATH (expected in CI; run locally to get real verification).'
      );
    } else {
      for (const [agentName, modelId] of Object.entries(personal.modelsByAgent)) {
        if (modelId === 'TODO') continue;
        if (!modelsResult.ids.has(modelId)) {
          error(
            `config/opencode.personal.jsonc: agent.${agentName}.model "${modelId}" was not ` +
              `found in \`opencode models\` output on this machine. Personal-profile IDs must ` +
              `be verified, not guessed (see docs/model-routing.md).`
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------
// (g) no leaked machine-specific paths / username
// ---------------------------------------------------------------------

function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, cb);
    } else if (entry.isFile()) {
      cb(full);
    }
  }
}

function scanFileForLeaks(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return; // not text, skip
  }
  const relPath = path.relative(REPO_ROOT, filePath);
  if (content.includes(FORBIDDEN_USERNAME)) {
    error(`${relPath}: contains a hardcoded username — this repo is public.`);
  }
  if (content.includes(FORBIDDEN_HOME_PREFIX)) {
    error(`${relPath}: contains a hardcoded absolute home-directory path — use $HOME / derive from the script's own path instead.`);
  }
  if (content.includes(FORBIDDEN_PLAN_REF)) {
    error(`${relPath}: references the gitignored planning doc — dead link for any adopter of the public repo.`);
  }
}

function validateNoLeakedPaths() {
  const dirsToScan = ['agents', 'config', 'scripts', '.claude', '.codex'];
  for (const rel of dirsToScan) {
    const full = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(full)) continue;
    walk(full, scanFileForLeaks);
  }
  const agentsMd = path.join(REPO_ROOT, 'AGENTS.md');
  if (fs.existsSync(agentsMd)) scanFileForLeaks(agentsMd);
}

// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Claude Code mirror tier map (CLAUDE_MODEL_BY_AGENT in sync-agents.mjs)
// must cover exactly the six agents — a missing entry would make
// sync-agents.mjs fail at generation time, and an extra entry means a
// renamed/removed agent left a stale tier behind. Alias values must be
// ones the Claude Code subagent `model:` field documents.
// ---------------------------------------------------------------------

const CLAUDE_MODEL_ALIASES = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

function validateClaudeTierMap() {
  const mapped = Object.keys(CLAUDE_MODEL_BY_AGENT);
  for (const name of TEAM_ROLES) {
    if (!mapped.includes(name)) {
      error(
        `sync-agents.mjs: CLAUDE_MODEL_BY_AGENT has no entry for "${name}" — its Claude ` +
          `Code mirror would default to model: inherit (the caller's model, i.e. maximum spend).`
      );
    }
  }
  for (const name of mapped) {
    if (!TEAM_ROLES.includes(name)) {
      error(
        `sync-agents.mjs: CLAUDE_MODEL_BY_AGENT has an entry for "${name}", which is not ` +
          `one of the six agents — remove the stale entry or add agents/${name}.md.`
      );
    }
    const alias = CLAUDE_MODEL_BY_AGENT[name];
    if (typeof alias !== 'string' || !CLAUDE_MODEL_ALIASES.includes(alias)) {
      error(
        `sync-agents.mjs: CLAUDE_MODEL_BY_AGENT["${name}"] is ${JSON.stringify(alias)} — ` +
          `expected one of the documented Claude Code aliases: ${CLAUDE_MODEL_ALIASES.join(', ')}.`
      );
    }
  }
}

// ---------------------------------------------------------------------
// Codex: config/codex.{personal,work}.jsonc profiles and the generated
// .codex/agents/*.toml files. Staleness is detected by rebuilding each
// file in-memory via the generator's own exported builder and comparing
// byte-for-byte — so a hand-edited TOML or an outdated generation both
// fail. Structural TOML checking beyond that is intentionally limited
// (zero-dep: we assert the exact shapes we emit, not full TOML grammar).
// ---------------------------------------------------------------------

function validateCodexProfile(fileName, { isPersonal }) {
  const full = path.join(REPO_ROOT, 'config', fileName);
  if (!fs.existsSync(full)) {
    error(`config/${fileName} does not exist.`);
    return null;
  }
  let agents;
  try {
    agents = loadCodexProfile(fileName.replace(/^codex\./, '').replace(/\.jsonc$/, ''));
  } catch (e) {
    error(`config/${fileName}: ${e.message}`);
    return null;
  }
  for (const role of TEAM_ROLES) {
    const entry = agents[role];
    if (!entry || typeof entry !== 'object') {
      error(`config/${fileName}: agent.${role} is missing — every role needs a deliberate model/effort policy (or an explicit TODO).`);
      continue;
    }
    if (typeof entry.model !== 'string' || entry.model === '') {
      error(`config/${fileName}: agent.${role}.model is missing (use "TODO" if unknown — an absent key hides the decision).`);
    } else if (entry.model === 'TODO') {
      if (isPersonal) {
        error(`config/${fileName}: agent.${role}.model is still "TODO" — the personal profile ships working (see docs/codex.md).`);
      } else {
        warn(`config/${fileName}: agent.${role}.model is still "TODO" — fill it with a verified slug on the work account (see docs/codex.md).`);
      }
    }
    if (entry.model_reasoning_effort && !CODEX_EFFORTS.includes(entry.model_reasoning_effort)) {
      error(`config/${fileName}: agent.${role}.model_reasoning_effort "${entry.model_reasoning_effort}" is not one of ${CODEX_EFFORTS.join(', ')}.`);
    }
    if (entry.sandbox_mode && !CODEX_SANDBOX_MODES.includes(entry.sandbox_mode)) {
      error(`config/${fileName}: agent.${role}.sandbox_mode "${entry.sandbox_mode}" is not one of ${CODEX_SANDBOX_MODES.join(', ')}.`);
    }
  }
  const reviewer = agents['code-reviewer'];
  if (reviewer && reviewer.sandbox_mode !== 'read-only') {
    error(`config/${fileName}: agent.code-reviewer.sandbox_mode must be "read-only" — the reviewer must not be able to edit (defense in depth alongside its instructions).`);
  }
  for (const role of Object.keys(agents)) {
    if (!TEAM_ROLES.includes(role)) {
      error(`config/${fileName}: agent.${role} is not in the team roster — remove it or add agents/${role}.md.`);
    }
  }
  return agents;
}

function validateCodexModelSlugs(agents) {
  // Live verification against the local Codex model cache, mirroring the
  // \`opencode models\` check: skip with a warning when unavailable (CI).
  const cachePath = path.join(process.env.HOME || '', '.codex', 'models_cache.json');
  if (!process.env.HOME || !fs.existsSync(cachePath)) {
    warn('Skipping Codex model-slug verification — no ~/.codex/models_cache.json on this machine (expected in CI; run codex once locally to populate it).');
    return;
  }
  let slugs;
  try {
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    slugs = new Set((cache.models || []).map((m) => m.slug));
  } catch (e) {
    warn(`Could not read ~/.codex/models_cache.json (${e.message}) — skipping slug verification.`);
    return;
  }
  for (const role of TEAM_ROLES) {
    const entry = agents[role];
    if (!entry || typeof entry.model !== 'string' || entry.model === 'TODO') continue;
    if (!slugs.has(entry.model)) {
      error(`config/codex.personal.jsonc: agent.${role}.model "${entry.model}" is not in this machine's live Codex model list — personal-profile slugs must be verified, not guessed.`);
    }
  }
}

function validateCodexGeneratedFiles() {
  const outDir = path.join(REPO_ROOT, '.codex', 'agents');
  let profileAgents;
  try {
    profileAgents = loadCodexProfile('personal');
  } catch {
    return; // already reported by validateCodexProfile
  }
  for (const role of TEAM_ROLES) {
    const tomlPath = path.join(outDir, `${role}.toml`);
    if (!fs.existsSync(tomlPath)) {
      error(`.codex/agents/${role}.toml is missing — run \`node scripts/sync-codex-agents.mjs --profile personal\`.`);
      continue;
    }
    const existing = fs.readFileSync(tomlPath, 'utf8');
    const srcPath = path.join(REPO_ROOT, 'agents', `${role}.md`);
    if (!fs.existsSync(srcPath)) continue; // missing source reported elsewhere
    let expected;
    try {
      const parsed = parseFrontmatterFile(fs.readFileSync(srcPath, 'utf8'));
      expected = buildCodexToml(role, parsed.frontmatter, parsed.body, profileAgents[role]);
    } catch (e) {
      error(`.codex/agents/${role}.toml: could not rebuild for comparison — ${e.message}`);
      continue;
    }
    if (existing !== expected) {
      error(`.codex/agents/${role}.toml is stale or hand-edited — regenerate with \`node scripts/sync-codex-agents.mjs --profile personal\`.`);
      continue;
    }
    // Structural sanity on what we emitted (belt and braces; limited to the
    // shapes this repo generates — this is NOT a full TOML parser).
    for (const required of ['name = ', 'description = ', 'developer_instructions = ']) {
      if (!existing.includes(required)) {
        error(`.codex/agents/${role}.toml: missing required key ${required.trim()}.`);
      }
    }
    if (!existing.includes(`name = "${role}"`)) {
      error(`.codex/agents/${role}.toml: name does not match its filename/roster entry.`);
    }
    for (const alias of ['"fable"', '"sonnet"', '"haiku"', '"opus"', 'ollama/', 'opencode/']) {
      if (existing.includes(`model = ${alias}`) || (alias.endsWith('/') && existing.includes(`model = "${alias}`))) {
        error(`.codex/agents/${role}.toml: model looks like a Claude/OpenCode ID (${alias}) — Codex needs Codex slugs.`);
      }
    }
  }
  const reviewerPath = path.join(outDir, 'code-reviewer.toml');
  if (fs.existsSync(reviewerPath)) {
    const reviewer = fs.readFileSync(reviewerPath, 'utf8');
    if (!reviewer.includes('sandbox_mode = "read-only"')) {
      error('.codex/agents/code-reviewer.toml: sandbox_mode = "read-only" is missing — the reviewer must not be able to edit.');
    }
    if (!/You review\. You do not fix\./.test(reviewer)) {
      error('.codex/agents/code-reviewer.toml: the review-only instruction ("You review. You do not fix.") is missing from developer_instructions.');
    }
  }
}

function validateAgentsMd() {
  const agentsMd = path.join(REPO_ROOT, 'AGENTS.md');
  if (!fs.existsSync(agentsMd)) {
    error('AGENTS.md is missing at the repo root — Codex reads it as shared policy for the six roles.');
    return;
  }
  const content = fs.readFileSync(agentsMd, 'utf8');
  for (const marker of ['## Worker contract', '## Role-specific guardrails']) {
    if (!content.includes(marker)) {
      error(`AGENTS.md: required section "${marker}" is missing (worker-brief and review rules must survive edits).`);
    }
  }
}

function validateCodex() {
  const personal = validateCodexProfile('codex.personal.jsonc', { isPersonal: true });
  validateCodexProfile('codex.work.jsonc', { isPersonal: false });
  if (personal) validateCodexModelSlugs(personal);
  validateCodexGeneratedFiles();
  validateAgentsMd();
}

// Shared source checks always run; platform-specific checks are gated.
validateAgents();
if (wants('opencode') || wants('claude')) validateSkills(); // skills serve both
if (wants('opencode')) validateConfigs();
if (wants('claude')) validateClaudeTierMap();
if (wants('codex')) validateCodex();
validateNoLeakedPaths();

if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  WARN  ${w}`);
}
if (errors.length) {
  console.log(`\n${errors.length} error(s):`);
  for (const e of errors) console.log(`  FAIL  ${e}`);
  console.log(`\nvalidate.mjs (--platform ${PLATFORM}): FAILED with ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(1);
} else {
  console.log(`\nvalidate.mjs (--platform ${PLATFORM}): OK (${warnings.length} warning(s), 0 errors).`);
  process.exit(0);
}
