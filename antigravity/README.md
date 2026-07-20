# Antigravity Integration

Ports the OpenCode multi-agent engineering team into Google Antigravity's
native subagent system with tiered model routing.

## Quick Start

```bash
# From the repo root:
antigravity/install.sh

# Dry run first to see what will happen:
antigravity/install.sh --dry-run

# To remove:
antigravity/install.sh --uninstall
```

The install script symlinks (never copies) into `~/.gemini/`, so the repo
stays the single source of truth — edit here, not under `~/.gemini/`.

## What Gets Installed

| File | Installed to | Purpose |
|------|-------------|---------|
| `antigravity/skill/SKILL.md` | `~/.gemini/skills/engineering-team/SKILL.md` | Antigravity skill definition — documentation, hierarchy, model routing reference |
| `antigravity/rules/engineering-team.md` | `~/.gemini/rules/engineering-team.md` | Rule that teaches Antigravity how to `define_subagent` for each agent on-demand |
| `antigravity/install.sh` | *(not installed)* | The installer itself |

## Agent → Antigravity Mapping

| OpenCode Agent | Antigravity Subagent | Model Tier | Write Tools | Subagent Tools |
|---------------|---------------------|-----------|-------------|----------------|
| tech-lead | `oc-tech-lead` | `pro` | ✗ | ✓ |
| senior-dev | `oc-senior-dev` | `pro` | ✓ | ✗ |
| implementer | `oc-implementer` | `inherit` | ✓ | ✗ |
| boilerplate | `oc-boilerplate` | `flash` | ✓ | ✗ |
| code-reviewer | `oc-code-reviewer` | `pro` | ✗ | ✗ |
| debugger | `oc-debugger` | `pro` | ✓ | ✗ |

### Key Design Decisions

1. **`oc-` prefix**: Avoids collisions with Antigravity's built-in `research`
   and `self` subagents.

2. **Model routing via Antigravity tiers**: OpenCode's model routing
   (`opencode.jsonc → agent.*.model`) maps to Antigravity's 4-tier system
   (`flash_lite` / `flash` / `inherit` / `pro`). The mapping preserves the
   original intent: strongest models for orchestration and reasoning, cheapest
   for mechanical work.

3. **Permission enforcement via tool grants**: OpenCode enforces hierarchy via
   `permission.task` and `permission.edit`. Antigravity enforces via
   `enable_write_tools` and `enable_subagent_tools`:
   - `oc-tech-lead`: no write tools (doesn't write code), has subagent tools
     (delegates)
   - `oc-code-reviewer`: no write tools (review only, never fixes)
   - Workers: write tools yes, subagent tools no (prevents delegation loops)

4. **Rules-based registration**: The rules file teaches Antigravity to
   `define_subagent` on-demand rather than pre-registering all six at
   session start. This avoids wasting context when only one or two agents
   are needed.

## How It Works at Runtime

1. User asks for a complex feature → Antigravity reads the rule
2. Antigravity calls `define_subagent` for `oc-tech-lead`
3. `oc-tech-lead` is invoked with `Model: "pro"` and `enable_subagent_tools: true`
4. Tech-lead reads the codebase, decomposes, and invokes workers:
   - `define_subagent` + `invoke_subagent` for `oc-implementer`, `oc-boilerplate`, etc.
5. Workers execute, report back to tech-lead
6. Tech-lead gates on review, reports to user

## Differences from OpenCode

| Feature | OpenCode | Antigravity |
|---------|----------|-------------|
| Model routing | `opencode.jsonc` per-agent | Antigravity tier system (`pro`/`inherit`/`flash`/`flash_lite`) |
| Permissions | `permission.task`, `permission.edit`, `permission.bash` | `enable_write_tools`, `enable_subagent_tools` |
| Agent definition | Frontmatter YAML + markdown body | `define_subagent` system prompt |
| Agent persistence | Always loaded from `~/.config/opencode/agents/` | Defined on-demand per conversation |
| Step limits | `steps: 20` in frontmatter | Not directly available; controlled by prompt |
| Fine-grained bash | Per-command allow/deny patterns | All-or-nothing via `enable_write_tools` |

## Editing Agents

Edit the files under `antigravity/` in this repo. Since install uses
symlinks, changes take effect in the next Antigravity session automatically.

To update the system prompts with more detail from the original OpenCode
agents, refer to the full definitions in `agents/*.md`.
