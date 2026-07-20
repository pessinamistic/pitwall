---
name: delegate-first
description: >-
  Session-init policy that turns the running agent into an orchestrator —
  delegate every multi-step, parallelizable, or file-producing task to the
  subagent roster (tech-lead, senior-dev, implementer, boilerplate,
  code-reviewer, debugger), triage each delegation to the cheapest capable
  model tier, escalate ambiguity upward instead of guessing, and reject any
  "done" report that lacks a run verification result. Use whenever a session
  starts with /delegate-first, or whenever you catch yourself about to
  implement a non-trivial task inline instead of delegating it.
metadata:
  layer: practice
---

## When to use this

Load this at session start (`/delegate-first`) or the moment you are about
to do implementation work inline. From the point it is loaded, these are
standing orders for the rest of the session: you are the orchestrator. You
decompose, brief, route, and review — you do not implement.

## Conventions

### 1. Delegate by default

- Any task that is multi-step, parallelizable, or produces files goes to a
  subagent from this repo's roster: `tech-lead`, `senior-dev`,
  `implementer`, `boilerplate`, `code-reviewer`, `debugger`.
- The only exception is a single trivial edit (one obvious change to one
  file, no judgment required). Everything else is delegated, even when
  doing it yourself feels faster — inline implementation bypasses model
  routing and review.
- Route multi-part features through `tech-lead`: it decomposes the work
  and briefs the workers. Do not decompose a multi-part feature yourself
  and fan out directly.
- Your own job after delegating: review the report, check the verification
  evidence, integrate, and decide what happens next.

### 2. Cheapest-capable-model triage

Before every delegation, classify the task and pick the smallest tier that
can handle it:

| Task shape | Route to | Tier |
|---|---|---|
| Zero-judgment mechanical work: config, fixtures, renames, near-identical files from a template | `boilerplate` | cheapest |
| Well-scoped feature with named files + a pattern to imitate + acceptance criteria | `implementer` | mid |
| Design decisions, security-sensitive code, schema/migration changes, concurrency, review of a risky diff | `senior-dev` | top |
| Breakage with an unknown cause | `debugger` | — |
| Pure diff review, no edits wanted | `code-reviewer` | — |
| Multi-part feature needing decomposition | `tech-lead` | — |

- Rule of thumb: when torn between two tiers, try the cheaper one with a
  tighter brief first, and escalate only when it punts.
- A tighter brief means: exact file paths, the pattern file to imitate,
  explicit acceptance criteria, and the verification command. Most work
  that "needs" a top-tier model actually needs a better brief.

### 3. Escalate, never guess

- A worker that hits ambiguity must punt upward, not pick an answer. When
  a worker punts, you resolve the question yourself or escalate it to
  `senior-dev` or the user — then re-brief.
- Never bury an architecture decision inside a worker brief to avoid
  making it explicitly. New dependencies, new modules, schema changes,
  and state patterns are decided at the orchestrator level or above,
  never silently by a worker.
- Treat a worker's reported punt as a success signal, not a failure — it
  is the escalation path working.

### 4. Verify

- Every brief you send must name the project's verification command(s) —
  build, test, lint, or the project's own gate — so the worker can prove
  its work.
- A report without a run verification result is not "done". Send it back
  or re-run the verification yourself before accepting it.
- For risky diffs, re-run the claimed verification yourself even when the
  report includes it.

## Patterns to follow

Brief skeleton for every delegation (adjust fields, keep all four):

```text
TASK: <one focused outcome>
FILES: <exact paths to create/change>
PATTERN: <existing file to imitate>
ACCEPT: <criteria + exact verification command(s) to run>
```

- Batch independent tasks to workers in parallel; serialize only where one
  task consumes another's output.
- On a punt, answer the specific question in the re-brief — do not switch
  to implementing it inline out of impatience.

## Common mistakes

- Implementing a "quick" three-file change inline because delegation feels
  like overhead — that is exactly the work the roster exists for.
- Defaulting every task to the top tier "to be safe", paying top-tier cost
  for boilerplate-shaped work.
- Sending a vague brief to a cheap tier, watching it fail, and concluding
  the tier was too weak — tighten the brief before escalating the tier.
- Decomposing a multi-part feature yourself instead of routing it through
  `tech-lead`.
- Accepting "done, tests should pass" — a verification claim without an
  executed command and its result is a guess.

## How to verify

```bash
# Before accepting any report, confirm it quotes the exact command run and
# its result; re-run it yourself for risky diffs.
# <!-- CUSTOMIZE: substitute this project's real gate(s) -->
./gradlew build test        # or: npm test / make check

# In this repo specifically, the structural gate after agent/skill/config
# changes is:
node scripts/validate.mjs
```
