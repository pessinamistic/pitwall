# Task learnings — .agents/learnings.md

Per-project scratch memory for **task-specific gotchas** an agent discovers
while working in this repo — not project-wide conventions, and not the
user's cross-project preferences. Lazily created: this file doesn't need to
exist until there is a real finding worth recording.

## Where a finding belongs (decide before writing here)

| Kind of finding | Goes in |
|---|---|
| Cross-project preference (how the user likes to work, in any repo) | `~/.claude/CLAUDE.md` (global, user-owned) |
| Project-intrinsic fact (a stable convention/architecture fact true of *this* project generally) | this project's `CLAUDE.md` / `AGENTS.md` |
| Task-specific gotcha (a sharp edge, workaround, or non-obvious cause found *while doing a task* here) | **this file** |

`tech-lead` reads this file during orientation and quotes still-relevant
entries into worker briefs — workers are stateless and cannot read it
themselves.

## Format

One line per entry, dated and evidence-backed:

```
- [YYYY-MM-DD] <fact> — evidence: <path:line|cmd>
```

No undated or unevidenced entries — a claim without a `path:line` or a
runnable command backing it is not durable knowledge, it's a guess.

## Keeping this file honest (curation, not just appending)

- **Rewrite or prune in place** when new evidence updates an entry — don't
  pile on a duplicate.
- **Delete on contradiction** — if you find evidence an entry is no longer
  true, remove it rather than leaving stale guidance for the next session.
- **Graduate** an entry out of this file when it outgrows "task gotcha":
  - Turns out to be true of the project generally → move it to this
    project's `CLAUDE.md`/`AGENTS.md`, then delete it here.
  - Turns out to be a cross-project preference → move it to
    `~/.claude/CLAUDE.md` (with the user's OK, since it's their global file),
    then delete it here.
  - Turns out to be wrong or no longer applicable → delete it, no
    replacement needed.

See the `learnings-curator` skill (`.claude/skills/learnings-curator/`) for
the full curation routine, and [docs/learnings.md](../docs/learnings.md) for
the feature writeup.

## Commit or gitignore?

Both are valid; this repo doesn't force either:
- **Commit it** if task gotchas are useful for every contributor/agent
  working in the repo.
- **Gitignore it** if it's closer to a personal/local scratchpad you don't
  want in shared history.

## Entries

<!--
Example (delete this comment; real entries go above it):
- [2026-01-15] `npm test` needs `DATABASE_URL` set even for unit tests — evidence: package.json:12
-->
