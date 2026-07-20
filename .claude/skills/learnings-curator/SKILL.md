---
name: learnings-curator
description: >-
  Curates this project's ./.agents/learnings.md — the per-project scratch
  memory for task-specific gotchas (not project-wide conventions, not
  cross-project preferences). Inspects before writing: dedupes, rewrites or
  prunes entries in place, deletes contradicted ones, and graduates a
  maturing entry to the project's CLAUDE.md/AGENTS.md or the user's global
  ~/.claude/CLAUDE.md when it outgrows a task-specific gotcha. Use whenever
  wrapping up a body of work that surfaced a durable task-level gotcha, when
  the user invokes /learnings-curator, or before a context reset/handoff on
  a project that has (or should start) a ./.agents/learnings.md.
metadata:
  layer: practice
---

## When to use this

Load this when a task surfaced a durable, task-specific gotcha worth
recording for the next session or the next worker brief, when the user
explicitly invokes `/learnings-curator`, or before a context reset/handoff.
`tech-lead` is the READ path for `./.agents/learnings.md` (see "Orienting
yourself" in `agents/tech-lead.md`) — this skill is the WRITE/curate path.

## Conventions

### 1. Three-way routing — decide before writing anything

Not every durable finding belongs in `./.agents/learnings.md`. Route first:

| Finding | Destination |
|---|---|
| Cross-project preference (a working-style choice true across every repo) | the user's global `~/.claude/CLAUDE.md` — only with the user's OK, since it's their file |
| Project-intrinsic fact (true of this project generally: architecture, build/test commands, conventions) | this project's `CLAUDE.md`/`AGENTS.md` |
| Task-specific gotcha (a sharp edge, workaround, or non-obvious cause found *while doing this task*, here, now) | `./.agents/learnings.md` — this skill's job |

If a finding isn't a task-specific gotcha, don't put it here even
temporarily — route it to its real home instead.

### 2. Inspect before you write

Never blind-append. Read the existing `./.agents/learnings.md` (if it
exists) in full before touching it:

- Does an existing entry already cover this? Rewrite that entry in place
  instead of adding a near-duplicate.
- Does new evidence contradict an existing entry? Delete or correct it —
  never leave a superseded entry sitting next to the correction.
- Has an entry outgrown "task-specific"? Graduate it (step 4) instead of
  leaving it here indefinitely.

### 3. Every entry is dated and evidence-backed

Format, one line per entry:

```
- [YYYY-MM-DD] <fact> — evidence: <path:line|cmd>
```

A fact with no `path:line` or no runnable command backing it is not durable
knowledge — it's a guess. Don't write it down; either find the evidence or
drop the finding.

### 4. Graduate, don't hoard

A task-specific gotcha sometimes turns out to be bigger than the task:

- **Turns out true of the project generally** → move it into this
  project's `CLAUDE.md`/`AGENTS.md`, then delete it from
  `./.agents/learnings.md`.
- **Turns out to be a cross-project preference** → propose adding it to
  the user's global `~/.claude/CLAUDE.md`; only write there with their
  explicit OK (it's their file, outside this project's scope), then delete
  it here once it lands.
- **Turns out wrong or stale** → delete outright, no replacement needed.

Curating is not optional maintenance — a `learnings.md` that only ever grows
is exactly as unreliable as one that's never updated.

### 5. Lazy creation

Don't create `./.agents/learnings.md` speculatively. If it doesn't exist
and you have a real finding, create it using the skeleton in this repo's own
`.agents/learnings.md` (header + routing table + format + entries section).
If it doesn't exist and you have nothing to record, do nothing.

### 6. Commit vs. gitignore is the project's call, not yours

Don't add or remove a `.gitignore` entry for `.agents/learnings.md` on your
own judgment — that choice belongs to whoever owns the project. If asked,
explain the tradeoff (shared team knowledge vs. personal/local scratch) and
let them decide.

## Patterns to follow

- One curation pass, one honest verdict: after curating, state plainly what
  was added, rewritten, pruned, or graduated, and where each destination
  file now stands — don't report "done" if a finding was routed but not yet
  confirmed by the user (e.g., a proposed global-CLAUDE.md addition awaiting
  their OK).
- Keep entries terse — one line, one fact, one piece of evidence. A
  multi-paragraph entry belongs in project docs, not here.

## Common mistakes

- Appending a new entry without checking whether an existing one already
  covers it — creates silent duplication that erodes trust in the file.
- Writing a fact with no evidence pointer "to save time" — the whole point
  of this file is that the next reader can verify, not just trust.
- Recording a cross-project preference or a stable project convention here
  instead of routing it to its real home — this file is for task gotchas
  only.
- Writing directly into the user's global `~/.claude/CLAUDE.md` without
  asking first.

## How to verify

```bash
# Sanity-check the file is well-formed markdown and every entry follows
# the dated + evidence-backed format:
grep -n '^- \[' .agents/learnings.md   # every entry line should match this
# <!-- CUSTOMIZE: substitute this project's real structural gate if one exists -->
node scripts/validate.mjs   # in this repo specifically; a target project may have no equivalent
```
