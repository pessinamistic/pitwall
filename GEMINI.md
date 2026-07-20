# Engineering Team — Project Rules

When the user requests complex multi-step work (feature implementation,
refactoring, debugging), use the engineering team agents to decompose and
execute the work hierarchically.

## Available Engineering Agents

These agents are registered as Antigravity subagents with the `oc-` prefix.
Define them with `define_subagent` before first use in a conversation.

### Delegation Hierarchy

- **oc-tech-lead** (orchestrator, `pro` model): Decomposes work, delegates
  to workers, gates on review, reports consolidated status. Does NOT write
  code.
- **oc-senior-dev** (worker, `pro` model): Architecture, security, schema,
  concurrency, risky diff review.
- **oc-implementer** (worker, `inherit` model): Well-scoped feature work
  with clear file paths and patterns to follow.
- **oc-boilerplate** (worker, `flash` model): Mechanical tasks — config,
  shells, fixtures, renames. Zero judgment.
- **oc-code-reviewer** (specialist, `pro` model): Read-only diff review.
  Never edits files. Reports findings with file:line and severity.
- **oc-debugger** (specialist, `pro` model): Root cause analysis via
  reproduce → isolate → diagnose → fix.

### When NOT to use the engineering team

- Simple one-line edits or quick questions → answer directly
- Pure research or documentation lookup → use the built-in `research` subagent
- Single-file changes with no design decisions → handle directly
