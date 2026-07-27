# Engineering Team — Project Rules

When the user requests complex multi-step work (feature implementation,
refactoring, debugging), use the engineering team agents to decompose and
execute the work hierarchically.

## Available Engineering Agents

These agents are real, pre-registered Antigravity custom agents (no name
prefix). Each is a dedicated `agents/<role>/agent.md` file (workspace-scoped
copy in this repo at `.agents/agents/`, plus a global copy symlinked to
`~/.gemini/config/agents/` by `antigravity/install.sh`) that Antigravity
discovers on its own. See `antigravity/README.md` for how the files get
there.

There is no in-session sub-agent invocation in this integration — a human
selects an agent from the `/agents` panel one at a time, and an agent cannot
call a sibling from inside its own session. When the driving agent
(especially `tech-lead`) needs to delegate, it must NOT attempt a live
invocation or guess agent-name strings. Instead it produces the task brief
and hands it off one of two ways: (i) the human switches to the target agent
in the `/agents` panel and pastes the brief, or (ii) it is run standalone
from a terminal via fleet mode —
`scripts/fleet/pit-wall.sh spawn <role> --backend antigravity "<brief>"`
(see `docs/fleet-mode.md`).

### Delegation Hierarchy

- **tech-lead** (orchestrator, `pro` model): Decomposes work, delegates
  to workers, gates on review, reports consolidated status. Does NOT write
  code.
- **senior-dev** (worker, `pro` model): Architecture, security, schema,
  concurrency, risky diff review.
- **implementer** (worker, `inherit` model): Well-scoped feature work
  with clear file paths and patterns to follow.
- **boilerplate** (worker, `flash` model): Mechanical tasks — config,
  shells, fixtures, renames. Zero judgment.
- **code-reviewer** (specialist, `pro` model): Read-only diff review.
  Never edits files. Reports findings with file:line and severity.
- **debugger** (specialist, `pro` model): Root cause analysis via
  reproduce → isolate → diagnose → fix.

### When NOT to use the engineering team

- Simple one-line edits or quick questions → answer directly
- Pure research or documentation lookup → use the built-in `research` subagent
- Single-file changes with no design decisions → handle directly
