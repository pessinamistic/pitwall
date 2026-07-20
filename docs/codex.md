# Using this team with Codex

Codex CLI supports **native custom agents**: TOML files discovered from
`.codex/agents/` (project-scoped, takes precedence) and `~/.codex/agents/`
(personal). This repo generates one per role from the same `agents/*.md`
sources that drive OpenCode and the Claude Code mirrors — single source of
truth, three platforms.

> An earlier revision of this page claimed Codex had no named-agent registry
> and that the root `AGENTS.md` was the whole integration. That was wrong for
> current Codex CLI (verified against codex-cli 0.144.6 and the official
> docs — citations below). `AGENTS.md` remains useful as shared policy; the
> registry is `.codex/agents/*.toml`.

## How it works

```text
agents/<role>.md ──sync-codex-agents.mjs──> .codex/agents/<role>.toml
config/codex.<profile>.jsonc ────────────────┘   (model / effort / sandbox)
```

- `name`, `description` and the markdown body (as `developer_instructions`)
  come from the source agent file. A few platform-specific phrases are
  rewritten (`CLAUDE.md` → `AGENTS.md`, OpenCode's Task-tool and one-shot
  worker wording) — see `CODEX_REWRITES` in `scripts/sync-codex-agents.mjs`.
- `model`, `model_reasoning_effort`, and `sandbox_mode` come from
  `config/codex.<profile>.jsonc`, which is **generator input** — Codex never
  reads it. A `TODO` model is omitted from the TOML so the role inherits the
  parent session model instead of shipping a fake slug.
- Regenerate with `node scripts/sync-codex-agents.mjs --profile personal`;
  CI uses `--check` to fail on stale files. `node scripts/validate.mjs
  --platform codex` rebuilds every file in-memory and errors on drift.

Codex discovers the files when the project is trusted — no installer step
touches `~/.codex` (`install.sh --target codex` only regenerates repo files;
`~/.codex/config.toml` is user-owned and never modified).

## Model tiers (personal profile)

Slugs verified live on 2026-07-20 against `~/.codex/models_cache.json`
(fetched by codex-cli 0.144.6; same tier ladder as docs/model-routing.md):

| Role | Model | Effort | Tier intent |
|---|---|---|---|
| `tech-lead` | `gpt-5.5` | high | strongest visible ("frontier model for complex coding") |
| `senior-dev` | `gpt-5.5` | high | strongest visible |
| `implementer` | `gpt-5.6-terra` | medium | balanced everyday coding |
| `boilerplate` | `gpt-5.6-luna` | low | fast and affordable, lowest cost |
| `code-reviewer` | `gpt-5.6-terra` | high | mid model + high reasoning, read-only sandbox |
| `debugger` | `gpt-5.6-terra` | high | mid model + high reasoning |

Notes from verification, so nobody re-guesses these:

- Bare `gpt-5.6` is **not** a real slug. The current family is
  `gpt-5.6-sol` (flagship), `gpt-5.6-terra` (balanced), `gpt-5.6-luna`
  (fast/affordable). `gpt-5.6-sol` is not exposed on the authoring account,
  which is why the top tier here is `gpt-5.5`. If your account has `sol`,
  promote `tech-lead`/`senior-dev` to it in `config/codex.personal.jsonc`
  and regenerate.
- Valid `model_reasoning_effort` values per the config reference:
  `minimal | low | medium | high | xhigh` (`xhigh` model-dependent; some
  models additionally expose `max`/`ultra` in the live cache — the
  validator accepts only the documented five, which is all this repo uses).
- The work profile (`config/codex.work.jsonc`) ships as a TODO template,
  warn-not-fail, same pattern as the OpenCode work profile: fill slugs from
  the work account's `~/.codex/models_cache.json` or `/model` picker.

## What maps, and what does not

| OpenCode source | Codex equivalent | Fidelity |
|---|---|---|
| filename / `description` / body | `name` / `description` / `developer_instructions` | full |
| profile model routing | `model` + `model_reasoning_effort` per agent TOML | full (per-role, baked at generation) |
| `permission.edit: deny` (code-reviewer) | `sandbox_mode = "read-only"` + the written review-only rule | default only — spawned agents inherit the parent turn's live sandbox/approval overrides, so a permissive parent can override it. Defense in depth, not a boundary. |
| `permission.task: deny` (workers) | Codex's `agents.max_depth` (default `1`, deliberately kept) | equivalent effect: spawned agents cannot spawn deeper |
| `permission.bash` pattern maps, web tool denies | — | not expressible per-agent; governed by the session sandbox/approval policy |
| `steps` cap, `temperature` | — | not expressible; bounded briefs carry the intent |
| `mode: primary` | — | no direct equivalent: with `max_depth = 1`, top-level orchestration happens in the main session (guided by `AGENTS.md`), or by spawning `tech-lead` for planning-only work — a spawned tech-lead cannot itself fan out |

## Trying it

In an interactive Codex session at this repo root (trusted project):

1. Ask Codex to delegate — e.g. "spawn code-reviewer on this diff". Codex
   selects custom agents by their `description`; the `/agent` command
   (alias `/subagents`) switches between spawned agent threads to inspect
   their work. (There is no `/agents` management picker — that was another
   stale claim; agent files are managed on disk.)
2. Verify `code-reviewer` reports findings without editing (read-only
   sandbox + instructions).
3. Verify `boilerplate` runs on `gpt-5.6-luna` at `low` effort (visible in
   the thread's session info).

## Sources (verified 2026-07-20)

- Custom agents / subagents — locations, TOML schema, sandbox inheritance,
  `agents.max_depth` / `max_threads`:
  <https://developers.openai.com/codex/agent-configuration/subagents.md>
- Config reference — `agents.*` keys, profiles, `model_reasoning_effort`
  values: <https://developers.openai.com/codex/config-file/config-reference.md>
- Models — the `gpt-5.6-sol` / `-terra` / `-luna` family and tier guidance:
  <https://developers.openai.com/codex/models.md>
- Slash commands — `/agent` (alias `/subagents`) thread switcher:
  <https://developers.openai.com/codex/cli/slash-commands.md>

(The `developers.openai.com/codex/*` URLs 308-redirect to
`learn.chatgpt.com/docs/*` — same official docs, either host works.)

The existing OpenCode and Claude Code installation paths are unchanged; see
the root README for those environments.
