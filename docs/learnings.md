# The learnings feature — `.agents/learnings.md`

A woven, per-project memory for facts that are true only about *doing a
task*, not about the project overall and not about how you like to work in
general. It lives at `.agents/learnings.md` in whatever repo the agents are
working in (a different file per project) — this repo ships only the
template/skeleton, in its own `.agents/learnings.md`.

## Why a third tier

Two memory tiers already exist and this feature doesn't duplicate either:

- `~/.claude/CLAUDE.md` — the user's own, global, cross-project preferences.
- The project's `CLAUDE.md`/`AGENTS.md` — stable, project-intrinsic facts
  (architecture, conventions, build commands).

Neither is the right home for "the config gate on this machine has 6
expected errors that aren't a bug" or "this script needs `--profile
personal` explicitly or it silently no-ops" — task-level gotchas discovered
mid-work, narrow enough that they don't belong in a project's canonical
docs, but valuable enough that the next session (or the next worker brief)
shouldn't have to rediscover them. That's what `.agents/learnings.md` is for.

## The contract

- **Format:** `- [YYYY-MM-DD] <fact> — evidence: <path:line|cmd>`. No
  undated or unevidenced entries.
- **Lazy-created.** No file until there's a real finding — the curator
  skill (or `tech-lead`) creates it on first write, using the skeleton in
  this repo's own `.agents/learnings.md`.
- **Read path:** `tech-lead` reads it during orientation (see "Orienting
  yourself" in `agents/tech-lead.md`) and quotes the entries relevant to a
  given task into that task's worker brief — workers are stateless, so this
  is the only way a finding here reaches them.
- **Write/curation path:** the `learnings-curator` skill
  (`.claude/skills/learnings-curator/`) — inspect-then-update, never
  blind-append; rewrites or prunes entries in place, deletes on
  contradiction, and graduates a maturing entry to the project's
  `CLAUDE.md`/`AGENTS.md` or to the user's global `~/.claude/CLAUDE.md` when
  it outgrows a task-specific gotcha.
- **Commit vs. gitignore is a per-project call**, not one this repo makes
  for you — see the note in `.agents/learnings.md` itself.

## See also

- `.agents/learnings.md` — the template/skeleton.
- `.claude/skills/learnings-curator/SKILL.md` — the curation routine.
- [docs/adding-a-skill.md](adding-a-skill.md) — skill-authoring constraints,
  if you want to adapt the curator skill.
