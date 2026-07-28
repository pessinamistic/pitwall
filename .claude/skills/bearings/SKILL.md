---
name: bearings
description: >-
  Generates a "pick up where I left off" status snapshot for this repo —
  uncommitted/unpushed git state, this project's own gate results
  (validate.mjs + doctor.sh), and any open items already recorded in a
  scratch handoff doc — composed into a fixed four-section report (Needs
  your decision / Recently done / Underway / Next up) written to a
  gitignored dated file plus a concise chat summary. Read-only: never edits
  code, never commits, never mutates project state. Use when the user
  invokes /bearings or /debrief (aliases for the same thing), or asks for
  a status report, morning brief, catch-up, "where did I leave off," or
  "what's in progress," and during tech-lead orientation on a repo that has
  (or should get) a fresh snapshot to work from.
metadata:
  layer: practice
---

# bearings

Generate a complete, standalone status snapshot from this repo's current
state, so anyone — the user or a fresh tech-lead session — can resume in
one read after a break, a context reset, or a session that died mid-task.
This skill is read-mostly: it gathers state and writes exactly one report
file. It never commits, pushes, edits source, or otherwise changes project
state as a side effect of producing the brief.

## When to use this

Load this when the user invokes `/bearings` or `/debrief` (both trigger this
skill — they are aliases for the same thing) or asks for a status report,
catch-up, "where did I leave off," or "what's in progress." `tech-lead`
also checks for a same-day snapshot during its own orientation pass (see
"Orienting yourself" in `agents/tech-lead.md`) and may generate a fresh one
before a long multi-step build or after resuming from a gap.

## Conventions

- **Read-only, always.** Never edit source, never `git commit`/`push`,
  never touch anything but the one `.agents/bearings-*.md` file.
- **No model or routing config.** This skill never reads or writes
  `config/*.jsonc` or adds a `model:` key anywhere — status reporting is
  unrelated to model routing and must not touch it.
- **A complete snapshot, not a diff.** Every run re-derives all four
  sections from current state; don't assume continuity with a prior
  report.

## Patterns to follow

1. **Gather live repo state with deterministic, read-only commands.** Run
   each of these and read the output — don't hand-derive status from
   memory or from an earlier snapshot:
   - `git status --porcelain=v1 --branch` — working-tree and
     upstream-tracking state.
   - `git log --oneline -10` — recent commit history.
   - `git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null` —
     ahead/behind count vs. the tracked remote branch (skip silently if
     there is no upstream).
   - `node scripts/validate.mjs --platform all` — the project's contract
     gate. This repo has a **known baseline**: `config/*.work.jsonc`
     TODO-model placeholders warn by design, and
     `config/opencode.personal.jsonc` model IDs only resolve on a machine
     authenticated against that provider — don't report either as a new
     problem. Only surface errors/warnings beyond that baseline under
     "Needs your decision."
   - `bash scripts/doctor.sh` — preflight/health check (silent = clean).
   - Check for gitignored scratch handoff docs — don't hardcode filenames
     (they're project-specific and, being gitignored, would be dead
     references for anyone else who adopts this skill). Discover them
     instead:
     `git status --porcelain=v1 --ignored | grep '^!! ' | grep '\.md$'`
     lists every gitignored Markdown file; a root-level one with a name
     suggesting a handoff/plan/notes doc (not this skill's own
     `.agents/bearings-*.md` output) is a candidate. If any exist, read
     them for their own "done," "still open," "queued next," or
     "deferred" sections; fold genuinely still-relevant items into the
     report instead of copying the whole doc.
2. **Compose the report around a fixed four-section spine**, each section
   always present even when empty (never omit a section — use its
   empty-state sentence instead):
   - **Needs your decision** — new/unexpected `validate.mjs` findings
     (beyond the known baseline above), a diverged or conflicted branch, or
     an open question recorded in a scratch handoff doc that only the user
     can resolve. Empty-state: "Nothing needs a decision right now."
   - **Recently done** — the last handful of commits (from `git log`), one
     line each, plus anything marked done/complete in a scratch handoff
     doc. Empty-state: "No recent commits."
   - **Underway** — uncommitted working-tree changes (summarized from
     `git status`, grouped by area, not a raw file dump for anything over
     ~15 files) plus anything a scratch handoff doc marks in-progress.
     Empty-state: "Working tree is clean; nothing underway."
   - **Next up** — deferred/TODO/"queued next" items named in a scratch
     handoff doc, or a follow-up implied by a gate warning. Empty-state:
     "Nothing queued."
   Every report is a complete current snapshot, never a delta against an
   earlier one — don't read a previous `.agents/bearings-*.md` to decide
   what changed or what to omit.
3. **Write the dated report, then give a concise chat digest.**
   - Write the full report to `.agents/bearings-<YYYY-MM-DD>.md` (today's
     date). If that file already exists, overwrite it — one fresh, complete
     snapshot per day, not an append.
   - Reply in chat with the same four sections in the same order,
     materially shorter than the file (a line or two per item), and point
     to the file for full detail.

## Common mistakes

- Reporting the known `validate.mjs` baseline (work-profile TODO
  placeholders, unauthenticated-machine model IDs) under "Needs your
  decision" — that's expected noise, not a new finding.
- Dumping a raw `git status` file list into "Underway" instead of
  summarizing it.
- Treating an old snapshot file as ground truth instead of re-running the
  gather step.

## How to verify

```bash
git status --porcelain=v1 --branch
git log --oneline -10
node scripts/validate.mjs --platform all
bash scripts/doctor.sh
ls .agents/bearings-*.md 2>/dev/null   # confirm today's file was written
```
