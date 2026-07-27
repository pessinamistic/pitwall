# Engineering Team — Delegation Guidance

The six-role engineering team is available as real, pre-registered
Antigravity custom agents — there is no `define_subagent` step. Each is a
dedicated `agents/<role>/agent.md` file (workspace-scoped copy in this
repo at `.agents/agents/`, plus a global copy symlinked to
`~/.gemini/config/agents/` by `antigravity/install.sh`) that Antigravity
discovers on its own. See `antigravity/README.md` for how the files get
there.

There is no in-session sub-agent invocation in this integration — a human
selects an agent from the `/agents` panel one at a time, and an agent
cannot call a sibling from inside its own session. When the driving agent
(especially `tech-lead`) needs to delegate, it must NOT attempt a live
invocation or guess agent-name strings. Instead it produces the task brief
and hands it off one of two ways: (i) the human switches to the target
agent in the `/agents` panel and pastes the brief, or (ii) it is run
standalone from a terminal via fleet mode —
`scripts/fleet/pit-wall.sh spawn <role> --backend antigravity "<brief>"`
(see `docs/fleet-mode.md`).

This guidance applies to whichever agent is currently driving the
conversation — the primary Antigravity assistant, or `tech-lead` once
selected — when deciding how to route work across the team.

## The Team

- **tech-lead** (orchestrator, `pro`): decomposes work, delegates to
  workers, gates on review, reports consolidated status. Orchestrates and
  delegates rather than writing code directly; may edit as a last resort
  (the source permission is an escape hatch requiring confirmation, not an
  absolute block).
- **senior-dev** (worker, `pro`): architecture, security, schema,
  concurrency, risky-diff review.
- **implementer** (worker, `inherit`): well-scoped feature work with
  clear file paths and patterns to follow.
- **boilerplate** (worker, `flash`): mechanical tasks — config, shells,
  fixtures, renames. Zero judgment.
- **code-reviewer** (specialist, `pro`): read-only diff review. Never
  edits files. Reports findings with file:line and severity.
- **debugger** (specialist, `pro`): root cause analysis via
  reproduce → isolate → diagnose → fix.

## When to Use the Team

- **tech-lead**: multi-step feature requests, project-wide changes,
  anything needing decomposition and coordination.
- **senior-dev**: module/service design, security config, schema and
  migrations, caching, concurrency, reviewing risky diffs.
- **implementer**: CRUD endpoints, UI components, DTOs/mappers, standard
  tests, Docker/CI yaml — needs clear file paths and a pattern to imitate.
- **boilerplate**: config files, entity shells, fixtures, renames,
  repetitive files. Zero-judgment mechanical work only.
- **code-reviewer**: independent diff review. Never edits files.
- **debugger**: failing tests, stack traces, unclear breakage.

Not every request needs the team — a one-line edit or a quick question
should be answered directly rather than routed through a worker.

## Delegation Protocol

Worker agents run in their own threads and see only the prompt they are
given — nothing of this conversation or of each other's work. Every task
brief must contain:

1. Exact file paths to create/modify.
2. A pattern file to imitate.
3. Acceptance criteria and verification commands.
4. Interface contracts other tasks depend on.
5. Relevant project constraints from README/docs.

## Escalation Ladder

```
boilerplate → (ambiguity) → implementer or tech-lead resolves
implementer → (design decision) → tech-lead decides or escalates to senior-dev
senior-dev → (dependency addition) → tech-lead approves
code-reviewer → (findings) → tech-lead routes fixes to original agent
debugger → (root cause found) → tech-lead routes fix to implementer/senior-dev
```

Never resolve an architecture question by silently picking an option in a
worker's brief — record the decision when reporting back.
