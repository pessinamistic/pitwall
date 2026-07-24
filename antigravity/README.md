# Antigravity Integration

Ports the OpenCode multi-agent engineering team into Google Antigravity's
native custom-agent system, with tiered model routing.

## Quick Start

```bash
# From the repo root:
antigravity/install.sh

# Dry run first to see what will happen:
antigravity/install.sh --dry-run

# To remove:
antigravity/install.sh --uninstall
```

The install script regenerates the six agent files (see "Agent Registration
Mechanism" below), then symlinks (never copies) into `~/.gemini/`, so the
repo stays the single source of truth — edit `agents/*.md`, not the
generated files or anything under `~/.gemini/`.

## What Gets Installed

| File | Installed to | Purpose |
|------|-------------|---------|
| `.agents/agents/oc-<role>/agent.md` (generated — see below) | `~/.gemini/config/agents/oc-<role>/agent.md` | The six native Antigravity custom agents, globally available across projects |
| `antigravity/skill/SKILL.md` | `~/.gemini/skills/engineering-team/SKILL.md` | Antigravity skill definition — documentation, hierarchy, model routing reference |
| `antigravity/rules/engineering-team.md` | `~/.gemini/rules/engineering-team.md` | Delegation-hierarchy and escalation-policy guidance for whichever agent is driving |
| every `.claude/skills/<name>/` directory | `~/.gemini/skills/<name>/` | Generalized mirror — every shared skill (`delegate-first`, `java`, `kafka`, ...) is symlinked in, so a skill added under `.claude/skills/` reaches Antigravity with no separate install step |
| `antigravity/install.sh` | *(not installed)* | The installer itself |

The generalized skill mirror loops over `.claude/skills/*/` at install time,
so it never needs updating when a new skill is added there — see
`docs/adding-a-skill.md`.

## Agent Registration Mechanism

The six agents are real, persistent `agent.md` files — not something
registered at conversation start. `scripts/sync-antigravity-agents.mjs`
generates them from `agents/*.md` (the same single source the Claude Code
and Codex mirrors use) into `.agents/agents/oc-<role>/agent.md`. These
generated files are committed to the repo.

Antigravity discovers agents from two locations (confirmed against
Antigravity's own docs — see "Sources" below):

- **Workspace-scoped**: `.agents/agents/<name>/agent.md`, walked up from the
  current working directory to the repo root (the directory containing
  `.git`). Because the generated files live at exactly that path in this
  repo, **the six agents are auto-discovered with no install step at all**
  whenever you're working inside this repo.
- **Global-scoped**: `~/.gemini/config/agents/<name>/agent.md`, available
  from any project. `antigravity/install.sh` symlinks each
  `.agents/agents/oc-<role>/` directory to
  `~/.gemini/config/agents/oc-<role>/` for this.

**Discovery gotcha**: an agent MUST live in its own dedicated subdirectory
— `agents/oc-tech-lead/agent.md`, never `agents/oc-tech-lead.md` directly
under the agents root. Antigravity's docs call this out explicitly: placing
files directly in the parent folder causes discovery failures. Both the
generator and `antigravity/install.sh` are written to respect this.

### Confirmed frontmatter schema

```yaml
---
name: oc-tech-lead
description: "..."
model: pro
---
```

Only `name`, `description`, and `model` are confirmed. `model` accepts only
`flash`, `pro`, or `inherit` (defaulting to `inherit` if omitted) — no other
tier names are documented, despite an earlier version of this integration
assuming a 4-tier system including `flash_lite`.

There is **no frontmatter field for write- or subagent-tool permission**
(the vocabulary `enable_write_tools`/`enable_subagent_tools` belonged to the
old, dynamic `define_subagent` tool-call mechanism, which this integration
no longer uses). Where the OpenCode source restricts direct edits, that
intent is instead expressed as a short prose note appended to the agent
body by the generator — worded to match the actual restriction, not
overstate it: `oc-code-reviewer` (`permission.edit: deny` — absolute, no
write tools) gets "this agent profile has no write tools enabled — you
report findings; you never edit files," while `oc-tech-lead`
(`permission.edit: ask` — an escape hatch requiring confirmation, not a
hard block) gets a note that it still orchestrates and delegates but may
edit directly as a last resort.

## Agent → Antigravity Mapping

| OpenCode Agent | Antigravity Agent | Model Tier |
|---------------|---------------------|-----------|
| tech-lead | `oc-tech-lead` | `pro` |
| senior-dev | `oc-senior-dev` | `pro` |
| implementer | `oc-implementer` | `inherit` |
| boilerplate | `oc-boilerplate` | `flash` |
| code-reviewer | `oc-code-reviewer` | `pro` |
| debugger | `oc-debugger` | `pro` |

### Key Design Decisions

1. **`oc-` prefix**: Avoids collisions with Antigravity's built-in `research`
   and `self` subagents.

2. **Model routing via Antigravity tiers**: OpenCode's model routing
   (`opencode.jsonc → agent.*.model`) maps to Antigravity's confirmed model
   values (`flash` / `pro` / `inherit`). The mapping preserves the original
   intent: strongest models for orchestration and reasoning, cheapest for
   mechanical work. It is pinned in `ANTIGRAVITY_MODEL_BY_AGENT` in
   `scripts/sync-antigravity-agents.mjs`, the same pattern the Claude Code
   mirror uses for its own tier map.

3. **Permission intent via prose, not frontmatter**: see "Confirmed
   frontmatter schema" above — there is no structural permission field to
   set, so `oc-tech-lead` and `oc-code-reviewer` get a short appended note
   instead.

## How Agents Are Used at Runtime

Open the Antigravity app's `/agents` panel (or "Create New Agents" dialog)
and select `oc-tech-lead`, `oc-senior-dev`, etc. directly — there is no
`define_subagent` step. From there, the selected agent's own system prompt
(the body of its `agent.md`, ported from `agents/*.md`) drives delegation:
`oc-tech-lead` reads the codebase, decomposes the work, and hands focused
briefs to the workers; workers report back; `oc-tech-lead` gates on review
before reporting to the user. See `antigravity/rules/engineering-team.md`
for the delegation hierarchy and escalation ladder, which applies
regardless of which agent is currently driving.

**Acceptance check**: `validate.mjs --platform antigravity` can only verify
file structure (frontmatter shape, staleness) — it cannot confirm live
discovery. After installing, open the Antigravity app and confirm the six
`oc-*` agents actually appear in its `/agents` panel; that is the real test.
Separately, the `agy` CLI's `agent` subcommand (`agy agent`) is a
best-effort secondary check — it has previously shown an unresolved
discovery anomaly in ad hoc testing (printing no agents from a
hand-created workspace-scoped probe), so treat a clean CLI listing as a
bonus and the app's own panel as authoritative.

## Differences from OpenCode

| Feature | OpenCode | Antigravity |
|---------|----------|-------------|
| Model routing | `opencode.jsonc` per-agent | Confirmed tier values (`pro`/`inherit`/`flash`) in `ANTIGRAVITY_MODEL_BY_AGENT` |
| Permissions | `permission.task`, `permission.edit`, `permission.bash` | No frontmatter equivalent; write/subagent-tool intent is prose in the agent body |
| Agent definition | Frontmatter YAML + markdown body | Frontmatter YAML (`name`/`description`/`model`) + markdown body — same shape, smaller schema |
| Agent persistence | Always loaded from `~/.config/opencode/agents/` | Always loaded from `.agents/agents/` (workspace) and/or `~/.gemini/config/agents/` (global) — no per-conversation registration |
| Step limits | `steps: 20` in frontmatter | Not available; controlled by prompt |
| Fine-grained bash | Per-command allow/deny patterns | Not available; controlled by prompt |

## Editing Agents

Edit `agents/*.md` in this repo (the single source shared with the Claude
Code and Codex mirrors) — not the generated files under `.agents/agents/`
or anything under `~/.gemini/`. Then regenerate:

```bash
node scripts/sync-antigravity-agents.mjs --profile personal
```

`antigravity/install.sh` also regenerates automatically before it symlinks,
so a plain re-run picks up source changes too. `node
scripts/sync-antigravity-agents.mjs --check` (or `node scripts/validate.mjs
--platform antigravity`) fails if a committed generated file is stale or
hand-edited.

## Sources

Confirmed against Antigravity's own docs, fetched 2026-07-22:

- https://antigravity.google/docs/subagents
- https://antigravity.google/docs/cli/commands/agents
