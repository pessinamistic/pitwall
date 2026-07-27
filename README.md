<div align="center">

<img src="assets/banner.svg" alt="Scuderia — six roles, one pit wall; delegate, build, verify" width="100%">

# Scuderia

**Six roles, one pit wall.** &nbsp;·&nbsp; *Essere Ferrari.*

[![license](https://img.shields.io/badge/license-MIT-FFC400?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/pessinamistic/pitwall/ci.yml?style=flat-square&label=CI&color=00913A)](.github/workflows/ci.yml)
![harnesses](https://img.shields.io/badge/harnesses-4-E2001A?style=flat-square)
![node](https://img.shields.io/badge/node-%E2%89%A5%2020-6b6d76?style=flat-square)
![deps](https://img.shields.io/badge/deps-zero-E2001A?style=flat-square)

</div>

An orchestrated engineering team for [OpenCode](https://opencode.ai): a
`tech-lead` agent that plans and delegates, five worker agents that execute,
and per-role model routing that puts each role on the cheapest model that can
do its job. The same six roles are also available as native agents in
[Codex](#codex) and as mirrored subagents in Claude Code, all generated from
one set of source prompts. The skills the team relies on are shared across
OpenCode and Claude Code from a single directory, and a benchmark harness
lets you tune routing from data instead of vibes.

Three things make this more than six prompt files:

- **Orchestration is enforced by permissions, not prose.** The hierarchy is
  wired into OpenCode's `permission` config, so it holds even when the model
  would rather freelance.
- **Model routing lives in config profiles, not agent files.** The same six
  prompts run unmodified on a GitHub Copilot machine and on a local
  Ollama machine — only the routing table differs.
- **Briefs are the primary cost optimization.** The tech lead's delegation
  contract (exact paths, pattern file, acceptance criteria, verification
  command) is what keeps worker token spend down; model tiering is the
  second-order saving. See [docs/writing-briefs.md](docs/writing-briefs.md).

Rosso Corsa flavor aside, the hierarchy below is the same shape Maranello
would recognize: a Race Engineer calling strategy, a Technical Director for
the hard calls, and a garage crew that executes.

<img src="assets/divider.svg" alt="" width="100%">

## The team

<div align="center">
<img src="assets/roster.svg" alt="The six roles — tech-lead (Race Engineer), senior-dev (Technical Director), implementer (Mechanic), boilerplate (Tyre Tech), code-reviewer (Scrutineer), debugger (Telemetry Engineer)" width="100%">
</div>

| Agent           | Role                                                                                                                       | Tier intent         | The tech lead routes here when…                                                                                  |
|-----------------|----------------------------------------------------------------------------------------------------------------------------|---------------------|------------------------------------------------------------------------------------------------------------------|
| `tech-lead`     | Primary orchestrator: decomposes requests, writes briefs, sequences work, enforces review, reports status                  | strongest available | — (this is the entry point; every multi-step request starts here)                                                |
| `senior-dev`    | Design, security config, schema/migrations, messaging, caching, concurrency; reviews risky diffs                           | large / strong mid  | the task needs judgment: architecture, auth, schema design, async pipelines, or an architectural read on a diff  |
| `implementer`   | Well-scoped feature work: CRUD endpoints, DTOs/mappers, UI from the existing design system, standard tests, Docker/CI yaml | code-tuned mid      | the task is fully specified and needs no design decisions — it stops and punts if one appears                    |
| `boilerplate`   | Mechanical work: config files, entity/DTO shells, fixtures, renames, repetitive near-identical files                       | cheapest available  | there is zero judgment involved; capped at 20 agentic steps so a misroute fails loudly instead of burning budget |
| `code-reviewer` | Reviews a diff and reports numbered `file:line` findings with severity — never edits                                       | reasoning-tuned     | it wants pure review signal on another agent's output, without the fix being silently applied                    |
| `debugger`      | Reproduce → isolate → diagnose → minimal fix, with root cause and fix reported separately                                  | reasoning-tuned     | something is broken and the cause is unknown (known-cause changes go to `implementer`/`senior-dev` instead)      |

## How orchestration is enforced

The hierarchy is config, not a request in English:

- **`tech-lead` has a `permission.task` allowlist** (`"*": deny` first, then
  the five workers allowed). Denied subagents are stripped from the Task tool
  entirely — the model never sees them, rather than politely declining them.
- **Every worker has `task: deny`** — no worker can delegate, so an
  implementer can never spawn another implementer and compound the token
  bill in a loop.
- **`code-reviewer` has `edit: deny`** — findings stay findings. A reviewer
  that can edit silently fixes instead of reporting, and you lose the signal
  that tells you which worker needed a better brief.
- **`boilerplate`** additionally gets a bash allowlist (test/lint/build
  commands only, everything else asks), `webfetch`/`websearch` denied, and a
  `steps: 20` cap.

Permission pattern maps in OpenCode are **last-match-wins**, which is why
every map in this repo lists `"*"` first — `validate.mjs` rejects any other
ordering, because a trailing wildcard silently overrides every specific rule
before it.

One honest limit: **you can always `@mention` a subagent directly** in
OpenCode, regardless of the tech lead's `task` rules. Permission gating
shapes what the agents do autonomously; it is not a security boundary.

## Quickstart

```bash
git clone <this-repo>
cd <this-repo>
./bootstrap.sh            # auto-detects platforms + profile, prompts to confirm in a terminal
# ./bootstrap.sh --fleet  # ...same, plus optional fleet mode (tmux orchestration) — see below
```

`./bootstrap.sh` is a thin wrapper at the repo root that forwards every
argument to `scripts/install.sh`, the real installer. It auto-detects both
the profile (personal vs. work, from `opencode models`) and the target: the
set of harnesses actually present on this machine (OpenCode, Claude Code,
Codex, and/or Antigravity/Gemini), asks you to confirm the detected
profile/target when run in a terminal, and finishes with a post-install
verification pass (`scripts/validate.mjs` then `scripts/doctor.sh`).
`--profile`, `--target`, and `--dry-run` still work as explicit overrides, and
`--fleet` / `--no-fleet` opt into or out of the optional
[fleet mode](#fleet-mode-optional) setup (in a terminal you're asked once if
neither is given).

`--target` is a comma-separated list of any subset of `opencode`, `claude`,
`codex`, `antigravity` (alias: `gemini`), run in that fixed order. Two
backward-compatible aliases: `default` (also the auto-detect fallback when
nothing is detected) = `opencode,claude`; `all` = `opencode,claude,codex,antigravity`
— **note this is a behavior change**: `all` now also runs the
antigravity/gemini step, which it did not before — see [Codex](#codex) below
for `--target codex`/`all`.

Before or after installing, `bash scripts/doctor.sh` is a standalone
preflight/health check: it prints one `MISSING: <thing> (install: <cmd>)`
line per problem (Node ≥ 20, OpenCode, `~/.claude`, Codex, live install
symlinks, and `tmux` if fleet mode is installed), stays silent when everything
is healthy, and always exits `0`.

What the installer does, per selected step, always in this fixed order
regardless of the order given on the command line:

1. **`opencode`** (part of `default`/`all`): runs `node scripts/validate.mjs`
   (the full contract check) and aborts if it fails, **backs up** any
   existing `~/.config/opencode/agents/` to a timestamped `.bak.<timestamp>`
   sibling and symlinks the repo's agents in, then merges the chosen
   `config/opencode.<profile>.jsonc` into `~/.config/opencode/opencode.jsonc`
   **after backing the original up**. Your existing keys (providers, MCP
   servers, …) win on every conflict except the `agent` block, where the
   profile's model routing wins. JSONC comments do not survive the merge;
   the backup keeps them.
2. **`claude`** (part of `default`/`all`): regenerates the Claude Code agent
   mirrors (`node scripts/sync-agents.mjs --profile <p>`) — the `--profile`
   flag is accepted for CLI compatibility but no longer changes mirror
   content; see "Claude Code mirrors" below — **backs up** any existing
   `~/.claude/agents/` the same way, then symlinks each skill directory into
   `~/.claude/skills/`, one at a time; an existing real (non-symlink) skill
   directory of the same name is skipped with a warning, never overwritten.
3. **`codex`** (part of `all` only): see [Codex](#codex) below.
4. **`antigravity`**/`gemini` (part of `all` only): delegates to
   `antigravity/install.sh` — see that script's own header for details.
5. **`fleet`** (optional; only with `--fleet`, or by answering yes to the
   terminal prompt): checks for `tmux` and symlinks the `pit-wall` CLI into
   `~/.local/bin` so fleet mode is on your `PATH`. If `tmux` isn't installed
   it warns and skips rather than failing. See
   [Fleet mode](#fleet-mode-optional).

Finally, regardless of which steps were selected, the installer re-runs
`node scripts/validate.mjs` and `bash scripts/doctor.sh` once as a
post-install verification pass, so you see immediately whether anything is
still missing.

Everything is symlinked, not copied, so the repo stays the single source of
truth and `git pull` updates your live setup. The script is safe to re-run.

Then start `opencode` in any project and select the `tech-lead` agent (it
registers as a primary agent) — hand it a multi-step feature request and let
it delegate. Small single edits are cheaper done directly with a worker.

## Fleet mode (optional)

Want to fire off several **independent** tasks in parallel and walk away,
instead of one delegation at a time inside a `tech-lead` session?
`scripts/fleet/pit-wall.sh` spawns each role as its own top-level `opencode`
process in its own tmux window and supervises the fleet from a live "pit
wall" board (`spawn`, `view --watch`, `attach`, `teardown`, …). It needs
`tmux`, and it is a genuinely separate mode, not an alternative front end for
the same thing: it **bypasses the permission-enforced tech-lead → worker
hierarchy** above, so reach for it on unrelated parallel tasks, and reach for
in-session orchestration when you want the enforced brief/review contract on
one body of work. Commands, statuses, and config:
[docs/fleet-mode.md](docs/fleet-mode.md).

## Model routing

Model IDs live **only** in `config/opencode.personal.jsonc` and
`config/opencode.work.jsonc`, never in agent frontmatter — that is what lets
the same agent files run on two machines with disjoint model sets.
`validate.mjs` rejects any agent file that grows a `model:` key.

- `config/opencode.personal.jsonc` ships **fully filled with verified local
  model IDs** (OpenCode's free `opencode/*` models plus Ollama).
- `config/opencode.work.jsonc` ships as a **template full of `TODO`s**. Fill
  it on the work machine from the output of
  `opencode models | grep -i copilot`, copied **verbatim** — Copilot's
  marketing names ("Claude Sonnet …", "GPT-…") are not OpenCode model IDs,
  and guessed IDs fail at invocation time with an unhelpful error.

The full tier reasoning and the step-by-step work-machine fill procedure are
in [docs/model-routing.md](docs/model-routing.md).

> [!WARNING]
> **The silent model-inheritance footgun.** A subagent with no `model` entry
> in the config does not fall back to a cheap default — it **inherits the
> model of the agent that invoked it**, which here means the tech lead's
> model: the most expensive one in the fleet. Because the agent files
> deliberately carry no `model:` key, the config profile is the only thing
> standing between you and every boilerplate task silently running on the
> tech lead's model. `node scripts/validate.mjs` fails loudly on any missing
> per-agent entry — run it after *every* hand-edit of a profile or of
> `~/.config/opencode/opencode.jsonc`. To confirm what actually ran, check
> the OpenCode TUI: it shows the model per session and per message, so open
> the subagent's session and read the model it reports.

**Remote-host note (personal profile):** `senior-dev`, `code-reviewer`, and
`debugger` all route to a remote Ollama host — if that host is unreachable,
those three roles fail together. The local-only fallback is to point all
three at `ollama-local/deepseek-coder-v2:16b` (the largest local option);
the profile carries the same note inline.

## Claude Code mirrors

`.claude/agents/` is **generated** by `scripts/sync-agents.mjs` from
`agents/` — every file in it starts with a `<!-- GENERATED … do not
hand-edit -->` header. Edit `agents/`, then re-run
`node scripts/sync-agents.mjs` (the installer does this for you).

Unlike OpenCode routing, which is per-machine config, **the Claude Code
mirrors carry a hardcoded model alias per role**, baked in at generation
time from `CLAUDE_MODEL_BY_AGENT` in `scripts/sync-agents.mjs`. Claude Code
runs on the same fixed subscription model set on every machine, so there is
nothing per-machine to route — the `--profile` flag `sync-agents.mjs`
accepts no longer affects the mirrors at all, it is kept only so
`install.sh` can call it uniformly:

| Role(s) | Alias | Tier |
|---|---|---|
| `tech-lead`, `senior-dev` | `fable` | strongest |
| `implementer`, `code-reviewer`, `debugger` | `sonnet` | mid |
| `boilerplate` | `haiku` | cheapest |

Aliases, not dated model IDs, so the mirrors don't rot as versions roll
forward. Permission blocks are translated where a direct tool equivalent
exists (a shorthand `deny` on `edit`/`task`/`webfetch`/`websearch` becomes a
`tools:` allowlist omitting the matching tool(s)); pattern-map rules and
`ask`/`allow` shorthands have no Claude Code frontmatter equivalent and are
dropped, with a comment in the generated file noting exactly what was
dropped and why.

The parallel footgun on this side: `validate.mjs` asserts
`CLAUDE_MODEL_BY_AGENT` covers exactly the six agents. A role missing from
that map would generate a mirror with no `model:` line — Claude Code's
documented behavior for an omitted model is `inherit`, i.e. run on the
*caller's* model, the same silent-maximum-spend failure mode as the
OpenCode warning above, just triggered from the generator side instead of
the config side.

## Codex

Codex CLI has a native custom-agent registry — `.codex/agents/*.toml`,
discovered automatically once a project is trusted. This repo generates one
TOML per role from the same `agents/*.md` sources that drive OpenCode and
the Claude Code mirrors: one set of prompts, three platforms.

**Quickstart:** open this repo in Codex CLI and trust it — the six agents
just work, since `.codex/agents/*.toml` ship already generated and current.
Ask Codex to delegate (e.g. "spawn code-reviewer on this diff"); Codex picks
custom agents by their `description`, and `/agent` (not `/agents` — there is
no separate agent-management picker in current Codex CLI) switches between
spawned agent threads.

To regenerate after editing an `agents/*.md` source or a
`config/codex.<profile>.jsonc`:

```bash
./scripts/install.sh --target codex              # repo files only, personal profile by default
# --target opencode,claude,codex (or --target all, which also runs antigravity) composes this with the other harnesses
node scripts/sync-codex-agents.mjs --profile personal --check   # CI: nonzero exit if any file is stale
```

The codex step (selected via `--target codex`, or as part of `--target all`)
only ever writes inside this repo, under `.codex/agents/` — **project-scope
only for now**; nothing under `~/.codex` is touched, since that directory is
user-owned. (Other targets composed alongside it — `opencode`, `claude`,
`antigravity` — do write under `$HOME`; see their own sections.)

Model, reasoning-effort, and sandbox values are generator input from
`config/codex.personal.jsonc` (model slugs verified against this machine's
live Codex model list: `gpt-5.5` for `tech-lead`/`senior-dev`,
`gpt-5.6-terra` for `implementer`/`code-reviewer`/`debugger`, `gpt-5.6-luna`
for `boilerplate`) and `config/codex.work.jsonc` (a `TODO` template, same
fill-on-the-real-machine pattern as the OpenCode work profile). Codex itself
never reads these `.jsonc` files — they only feed the generator.

The root [`AGENTS.md`](AGENTS.md) is Codex-facing shared policy (role
selection table, the brief contract, review-gate rules) that Codex reads the
way Claude Code reads `CLAUDE.md`, complementing the per-role TOML files.

Fidelity is not 1:1: `permission.edit: deny` maps to `sandbox_mode =
"read-only"` on `code-reviewer`, but a spawned agent can inherit the parent
turn's live sandbox/approval overrides, so treat that as defense in depth
alongside the written review-only instruction, not an absolute boundary.
OpenCode's per-pattern `bash` rules and `steps` caps have no Codex
equivalent at all. Full mapping table, verification steps, and sources:
[docs/codex.md](docs/codex.md).

## Skills

Thirteen skills live in `.claude/skills/<name>/SKILL.md`, a path both
OpenCode and Claude Code search — one directory serves both tools with zero
duplication.

Ten are stack conventions, written for a Java 21 / Spring Boot microservice
stack, and are **conventions, not tutorials** — topic naming, idempotency
rules, which-data-goes-where, and the exact verification commands, not
explanations of what Kafka is: `java`, `spring-boot`, `kafka`, `mongodb`,
`postgres`, `redis`, `elasticsearch`, `kubernetes`, `testing`, `debugging`.
`<!-- CUSTOMIZE: … -->` markers flag the org-specific values to replace.

The other three are policy/practice skills rather than stack conventions:

- **`delegate-first`** — loading it (`/delegate-first`) turns the running
  agent into an orchestrator for the rest of the session — delegate any
  multi-step, parallelizable, or file-producing task to the roster by
  default, triage each delegation to the cheapest capable model tier,
  escalate ambiguity upward instead of guessing, and reject any "done"
  report that lacks a verification result.
- **`learnings-curator`** — curates this project's `.agents/learnings.md`,
  the per-project scratch memory for task-specific gotchas: dedupes,
  rewrites or prunes entries in place, and graduates a maturing entry to
  `CLAUDE.md`/`AGENTS.md` or the user's global `~/.claude/CLAUDE.md` when
  it outgrows a task-specific gotcha. `tech-lead` is the read path;
  `/learnings-curator` (or the end of a body of work) is the write path.
- **`bearings`** — generates a "pick up where I left off" status snapshot
  (`/bearings`): git state, this project's own gate results, and any open
  items from a scratch handoff doc, composed into a fixed four-section
  report written to a gitignored dated file plus a concise chat summary.
  `tech-lead` checks for a current one during orientation.

Antigravity also receives every skill under `.claude/skills/*` — via
`antigravity/install.sh`, which mirrors each one into `~/.gemini/skills/`
alongside its own `engineering-team` skill — while Codex CLI has no
applicable skill-discovery mechanism today (see [docs/codex.md](docs/codex.md)).

To make a skill load automatically instead of needing an explicit
invocation every session, add a one-line trigger for it to your **global**
`CLAUDE.md` (`~/.claude/CLAUDE.md`) — the same pattern as any other
always-on skill, e.g. "At the start of every session, load the
`delegate-first` skill."

To add your own skill, see [docs/adding-a-skill.md](docs/adding-a-skill.md).

## Benchmarks

`benchmarks/run.mjs` runs the same prompt against a list of models via
`opencode run --model <id> --format json`, records wall-clock latency and
the **real token counts** the provider reported in the event stream (falling
back to a labeled estimate only when a run dies before reporting), and
computes cost from `benchmarks/pricing.json`. `benchmarks/report.mjs` folds
result files into a markdown report per task category, with quality measured
as mechanically-checked assertions from the prompt file — never an LLM
judging another LLM.

One honest caveat up front: a GitHub Copilot subscription bills by request
quota, not tokens, so the report's dollar figures are a proxy for
**relative** cost efficiency between models, not a bill. Details, flags, and
the rest of the caveats: [benchmarks/README.md](benchmarks/README.md).
Because routing lives in one small config file, acting on a benchmark result
is a one-line profile edit.

## Repository layout

```
├── AGENTS.md                    # Codex-facing shared policy (roles, brief contract, review gate)
├── agents/                      # OpenCode agent definitions — the source of truth
│   ├── tech-lead.md             # primary orchestrator
│   ├── senior-dev.md
│   ├── implementer.md
│   ├── boilerplate.md
│   ├── code-reviewer.md
│   └── debugger.md
├── .claude/
│   ├── agents/                  # GENERATED Claude Code mirrors — never hand-edit
│   └── skills/                  # thirteen skills, shared by OpenCode AND Claude Code
│       └── delegate-first/      # session-init orchestrator-mode policy skill
├── .codex/
│   └── agents/                  # GENERATED native Codex TOML agents — never hand-edit
├── config/
│   ├── opencode.personal.jsonc  # verified local routing (Ollama + opencode/*)
│   ├── opencode.work.jsonc      # Copilot routing — TODO template, fill on the work machine
│   ├── codex.personal.jsonc     # verified Codex model/effort/sandbox routing
│   └── codex.work.jsonc         # Codex routing — TODO template, fill on the work account
├── scripts/
│   ├── install.sh               # --target <comma-list of opencode|claude|codex|antigravity, or default|all>, --profile personal|work, --dry-run
│   ├── lint.sh                  # ShellCheck gate: pinned version + dynamically-discovered file set; --required-version
│   ├── sync-agents.mjs          # agents/ -> .claude/agents/ (hardcoded per-role model tiers)
│   ├── sync-codex-agents.mjs    # agents/ -> .codex/agents/*.toml (--profile, --check)
│   ├── validate.mjs             # contract checks (--platform all|opencode|claude|codex)
│   └── lib/                     # frontmatter/JSONC/TOML parsing, config merge
│       ├── team.mjs             # the six-role roster, imported by every script above
│       └── toml.mjs             # dependency-free TOML string encoder
├── benchmarks/
│   ├── run.mjs                  # same prompt across models via `opencode run`
│   ├── report.mjs               # markdown report per task category
│   ├── pricing.json             # per-token price snapshots (see caveats)
│   ├── prompts/                 # coding / debugging / planning / reviewing / tests
│   └── results/                 # run output (gitignored)
└── docs/
    ├── model-routing.md         # tiers, profiles, work-machine fill procedure
    ├── writing-briefs.md        # the brief contract and why it's the real cost lever
    ├── adding-a-skill.md        # constraints + template for new skills
    └── codex.md                 # Codex integration: mapping, model tiers, fidelity limits
```

**Requirements:** OpenCode on `PATH` for the `opencode` install target (part
of `default`/`all`), Node ≥ 20 (all scripts are dependency-free — no `npm
install`), bash. Codex CLI is only needed if you use `--target codex` (or
`all`), or want to actually run the generated `.codex/agents/*.toml` files.
Similarly, Antigravity/Gemini itself is only needed to actually run the
mirrored skill/rules files that `--target antigravity` (or `all`) installs.

## License

[MIT](LICENSE)
