#!/usr/bin/env node
// Deep-merges config/opencode.<profile>.jsonc into an existing OpenCode
// config. Existing keys win on conflict EVERYWHERE except inside the
// top-level "agent" block, where the profile's per-agent model routing
// wins (see README.md). Keys unique to either side are
// preserved (union), which is how the user's `provider` entries and `mcp`
// block survive a merge that only ever adds/overrides `$schema`, `model`,
// `permission`, and `agent`.
//
// Called by scripts/install.sh. Not meant to be run standalone against a
// file you care about without a backup — it has no backup logic of its
// own; install.sh backs the target up before invoking this.
//
// Usage: node merge-config.mjs <existingConfigPath> <profileConfigPath> <outputPath>

import fs from 'node:fs';
import path from 'node:path';
import { parseJsonc } from './jsonc.mjs';

const [, , existingPath, profilePath, outputPath] = process.argv;
if (!existingPath || !profilePath || !outputPath) {
  console.error('Usage: node merge-config.mjs <existingConfigPath> <profileConfigPath> <outputPath>');
  process.exit(1);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Inside the "agent" block: the profile wins on any leaf conflict, but
// keys that only exist on one side (e.g. a 7th agent the user added by
// hand, or an unrelated top-level agent key) are kept.
function mergeAgentWins(existing, incoming) {
  const result = { ...(existing || {}) };
  for (const key of Object.keys(incoming)) {
    if (isPlainObject(existing ? existing[key] : undefined) && isPlainObject(incoming[key])) {
      result[key] = mergeAgentWins(existing[key], incoming[key]);
    } else {
      result[key] = incoming[key];
    }
  }
  return result;
}

// Everywhere else: existing wins on any leaf conflict; only keys missing
// from existing get filled in from the profile.
function mergeExistingWins(existing, incoming) {
  const result = { ...(existing || {}) };
  for (const key of Object.keys(incoming)) {
    if (!(key in result)) {
      result[key] = incoming[key];
    } else if (isPlainObject(existing[key]) && isPlainObject(incoming[key])) {
      result[key] = mergeExistingWins(existing[key], incoming[key]);
    }
    // else: existing wins, leave result[key] as already spread.
  }
  return result;
}

const existing = parseJsonc(fs.readFileSync(existingPath, 'utf8'));
const profile = parseJsonc(fs.readFileSync(profilePath, 'utf8'));

const merged = { ...existing };
for (const key of Object.keys(profile)) {
  if (key === 'agent') {
    merged.agent = mergeAgentWins(existing.agent || {}, profile.agent || {});
  } else if (!(key in existing)) {
    merged[key] = profile[key];
  } else if (isPlainObject(existing[key]) && isPlainObject(profile[key])) {
    merged[key] = mergeExistingWins(existing[key], profile[key]);
  }
  // else: existing wins, nothing to do.
}

const header =
  `// Merged by scripts/install.sh from ${path.basename(profilePath)} on ${new Date().toISOString()}.\n` +
  '// Comments from both the pre-existing file and the profile were dropped by this\n' +
  "// merge (JSONC comments can't survive a parse/stringify round-trip). The\n" +
  '// pre-merge original was backed up first; see the install.sh output for its path.\n';

fs.writeFileSync(outputPath, header + JSON.stringify(merged, null, 2) + '\n');
console.log(`merge-config.mjs: wrote ${outputPath}`);
