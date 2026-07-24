---
name: engineering-team
description: >-
  Provides a hierarchical multi-agent engineering team ported from OpenCode.
  Six specialized agents (tech-lead, senior-dev, implementer, boilerplate,
  code-reviewer, debugger) with tiered model routing, enforced delegation
  hierarchy, and structured reporting contracts. Activate this skill when
  the user invokes /plan for complex multi-step work, asks for a feature
  implementation, or requests code review or debugging.
---

# Engineering Team — Antigravity Integration

This skill ports the OpenCode multi-agent engineering team into Antigravity's
native custom-agent system. The agents are real, persistent custom `agent.md`
files that Antigravity discovers on its own — workspace-scoped in this repo
under `.agents/agents/<role>/`, plus global copies under
`~/.gemini/config/agents/` installed by `antigravity/install.sh`. There is no
`define_subagent` / `invoke_subagent` step. Model routing is mapped to
Antigravity's tier system. See `antigravity/README.md` for the full
registration mechanism.

## Agent Hierarchy

```
                    ┌─────────────┐
                    │  tech-lead  │  (orchestrator, pro model)
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
     ┌─────┴─────┐   ┌─────┴──────┐  ┌─────┴────────┐
     │ senior-dev │   │implementer │  │  boilerplate │
     │  (pro)     │   │ (inherit)  │  │   (flash)    │
     └────────────┘   └────────────┘  └──────────────┘
           │
     ┌─────┴────────────────┐
     │                      │
┌────┴────────┐   ┌─────────┴──┐
│code-reviewer│   │  debugger  │
│   (pro)     │   │   (pro)    │
└─────────────┘   └────────────┘
```

## Model Routing

| Agent | Antigravity Model | Rationale |
|-------|-------------------|----------|
| tech-lead | `pro` | Needs strongest reasoning for decomposition, delegation, and review gating |
| senior-dev | `pro` | Architecture, security, schema design require deep reasoning |
| implementer | `inherit` | Well-scoped work; inherits the calling agent's model |
| boilerplate | `flash` | Mechanical tasks with zero judgment; speed over depth |
| code-reviewer | `pro` | Reasoning-heavy review; must catch subtle issues |
| debugger | `pro` | Root cause analysis requires deep reasoning chains |

## When to Use Each Agent

- **tech-lead**: Multi-step feature requests, project-wide changes, anything
  needing decomposition and coordination. Invoke directly — it will delegate.
- **senior-dev**: Module/service design, security config, schema/migrations,
  caching, concurrency, reviewing risky diffs.
- **implementer**: CRUD endpoints, UI components, DTOs/mappers, standard
  tests, Docker/CI yaml — needs clear file paths and a pattern to imitate.
- **boilerplate**: Config files, entity shells, fixtures, renames, repetitive
  files. Zero-judgment mechanical work only.
- **code-reviewer**: Independent diff review. Reports findings with file:line
  and severity. Never edits files.
- **debugger**: Failing tests, stack traces, unclear breakage. Follows
  reproduce → isolate → diagnose → fix methodology.

## Delegation Protocol

Worker agents are **stateless** — they see only the prompt you write. Every
task brief must contain:

1. Exact file paths to create/modify
2. A pattern file to imitate
3. Acceptance criteria and verification commands
4. Interface contracts other tasks depend on
5. Relevant project constraints from README/docs

## Escalation Ladder

```
boilerplate → (ambiguity) → implementer or tech-lead resolves
implementer → (design decision) → tech-lead decides or escalates to senior-dev
senior-dev → (dependency addition) → tech-lead approves
code-reviewer → (findings) → tech-lead routes fixes to original agent
debugger → (root cause found) → tech-lead routes fix to implementer/senior-dev
```

## Usage

These are six separate Antigravity custom agents (`tech-lead`, `senior-dev`,
`implementer`, `boilerplate`, `code-reviewer`, `debugger`). A human opens the
`/agents` panel and selects one at a time — there is no in-session sub-agent
invocation, and an agent cannot call a sibling agent from within its own
session.

To run a role standalone/non-interactively (for example, to fire off parallel
independent tasks), use fleet mode from a terminal:

```
scripts/fleet/pit-wall.sh spawn <role> --backend antigravity "<brief>"
```

See `docs/fleet-mode.md` for details.

When an interactively-running agent (e.g. `tech-lead`) needs to delegate, it
produces the task brief and hands it to the human — to either paste into the
target agent via the `/agents` panel or launch via fleet mode. It must NOT
attempt an in-session invocation or guess agent-name strings.
