// The single shared roster for the six-role engineering team. Every script
// that needs the role list imports it from here — validate.mjs,
// sync-agents.mjs (Claude Code mirrors), and sync-codex-agents.mjs (Codex
// native agents) — so a roster change happens in exactly one place.

export const TEAM_ROLES = [
  'tech-lead',
  'senior-dev',
  'implementer',
  'boilerplate',
  'code-reviewer',
  'debugger',
];

export const WORKER_ROLES = TEAM_ROLES.filter((role) => role !== 'tech-lead');
