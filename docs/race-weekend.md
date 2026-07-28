# The race weekend — Scuderia workflow guide

One complete feature from idea to merge, told in F1 terms. Every step has
the actual command to run. Read this once; the metaphor will stick.

---

## Friday — Free practice: orient yourself

Before anything else, get a read on where the car is.

```bash
/bearings          # or: /debrief  (they are aliases)
```

This runs `git status`, `git log`, `node scripts/validate.mjs`, and
`bash scripts/doctor.sh`, then writes a four-section snapshot to
`.agents/bearings-<today>.md` and prints a concise digest in chat:

- **Needs your decision** — open gate errors or diverged branch.
- **Recently done** — last few commits.
- **Underway** — uncommitted working-tree changes.
- **Next up** — deferred items from the last session's handoff doc.

If the gate is clean and the tree is clear, you're ready to qualify.

---

## Saturday — Qualifying: brief the tech-lead

Hand the tech-lead a feature request. It reads the repo, decomposes the
work, assigns each piece to the right worker, and presents a numbered plan
before touching any file.

In OpenCode:
```
Select agent: tech-lead
> Add a paginated "list orders by customer" endpoint to the order service.
```

In fleet mode (parallel independent features):
```bash
scripts/fleet/pit-wall.sh spawn tech-lead "add paginated customer orders endpoint"
scripts/fleet/pit-wall.sh watch
```

The tech-lead always runs first. It does not write code unless you explicitly
ask it to. Its job is the brief and the sequencing.

---

## Race — Pit stops: delegation chain

The tech-lead calls the pit stops in order. Each stop is a delegation to
the cheapest capable worker:

| Pit stop | Role | What it does |
|---|---|---|
| Config/fixtures first | `boilerplate` | Shells, DTOs, entity stubs — zero judgment |
| Feature implementation | `implementer` | CRUD, UI, tests — fully specified by the brief |
| Hard calls | `senior-dev` | Schema design, auth, concurrency, async |
| Review gate | `code-reviewer` | Read-only diff scan before merge |
| Unknown breakage | `debugger` | Reproduce → isolate → diagnose → fix |

You watch the delegation chain unfold. Each worker reports back to the
tech-lead with exact files changed and verification results. If a worker
punts (hits an ambiguity it can't resolve), the tech-lead resolves it or
escalates — never guesses.

---

## Safety car: handling a wedged task

If a fleet task stops making progress and is waiting on you, the pit-wall
board shows it in **red** (`WEDGED`) and rings a terminal bell.

```bash
scripts/fleet/pit-wall.sh attach <task-id>   # jump to the tmux window
# read what the agent is asking for
# answer the prompt, then:
scripts/fleet/pit-wall.sh view --watch        # back to the board
```

A wedged task is not a failure — it is the escalation path working. The
agent hit something only you can decide.

---

## Post-race — Scrutineering: the code-reviewer gate

Before any feature lands, risky diffs go through the scrutineering bay.
The `code-reviewer` is read-only: it reports numbered `file:line` findings
with severity (`blocker` / `should-fix` / `nit`), never edits.

The tech-lead gates on its verdict:
- Clean bill: *Scrutineering passed. Car is legal.* → ready to merge.
- Blockers found: *Not cleared for parc fermé.* → back to the author to fix.

```
Select agent: code-reviewer
> Review the diff from implementer on the customer orders endpoint.
  git diff main..HEAD -- src/
```

---

## Podium — Merge to main

One feature branch per body of work (cut by the tech-lead at the start).
When the gate is clean:

```bash
git push origin feat/<your-branch>
# open PR, CI runs node scripts/validate.mjs --platform all + lint
# merge when green
```

The tech-lead's final message on a clean gate: *Grazie, ragazzi.*

---

## Post-race debrief — capture the session's learnings

After a meaningful body of work, run the learnings curator to consolidate
what the session taught:

```bash
/learnings-curator
```

This reads `.agents/learnings.md`, dedupes entries, prunes stale ones, and
promotes anything that outgrows a task-specific gotcha into `AGENTS.md` or
`~/.claude/CLAUDE.md` so it travels to the next session.

---

## Quick reference: role → F1 title → when to use

| Agent | F1 title | Use for |
|---|---|---|
| `tech-lead` | Race Engineer | Any multi-step request; decomposes and delegates |
| `senior-dev` | Technical Director | Design, security, schema, concurrency, risky review |
| `implementer` | Race Mechanic | Well-scoped feature with named files + pattern |
| `boilerplate` | Tyre Technician | Config, shells, fixtures, zero-judgment mechanical work |
| `code-reviewer` | FIA Scrutineer | Read-only diff review before merge |
| `debugger` | Telemetry Engineer | Unknown-cause failures: reproduce → isolate → fix |

Not every request needs the team. A one-line edit or a quick question is
faster done directly — reach for the roster when the work is multi-step,
involves multiple files, or needs a review pass.
