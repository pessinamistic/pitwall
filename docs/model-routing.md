# Model routing

How agent → model assignment works in this repo, why it lives where it does,
and the exact procedure for filling in the work profile.

## Why routing lives in config, not agent frontmatter

The six agent prompts have to run on two machines with **disjoint model
sets**: a work machine where GitHub Copilot provides the models, and a
personal machine running local Ollama plus OpenCode's free `opencode/*`
models. Neither environment gets to be the one that "really" works while the
other is broken.

If each agent file carried a `model:` key, supporting both machines would
mean **two forks of every agent file** — and the prompt bodies (the part you
actually iterate on) would drift between the forks far faster than model
assignments ever could. So the repo inverts the natural choice:

- **No agent markdown file contains a `model:` key.** `validate.mjs` fails
  if one appears.
- Model assignment lives entirely in `config/opencode.<profile>.jsonc` under
  `agent.<name>.model` — one prompt, two routing tables.

The cost of this split is that role intent is no longer visible next to the
prompt. That is mitigated by the **tier comment on every line of both
profiles** ("strongest", "cheapest", "reasoning", …): when you edit a model
ID, check the replacement still satisfies the comment, and you never need to
open an agent file to reason about routing.

A second payoff: acting on a benchmark result (see below) is a one-line
config edit instead of a sweep through six agent files.

## Tier intents

The tier column is the contract; the model IDs are just the current
occupants of each tier on a given machine.

| Role | Tier intent | Why |
|---|---|---|
| `tech-lead` | strongest available | Planning and routing quality dominates total cost. The tech lead reads the docs, holds the task plan, and reads every worker report — a bad decomposition or a vague brief multiplies every downstream token. Do not economize here. |
| `senior-dev` | large / strong mid | Design, security, schema, and concurrency work needs depth and tolerates latency. |
| `implementer` | code-tuned mid | Well-briefed feature work; a code-specialized mid-size model is fast and sufficient when the brief carries the thinking. |
| `boilerplate` | cheapest available | Mechanical work only. Deliberately not the same model as `implementer` — if the cheapest model can't do a task, the task was misrouted, and the 20-step cap makes that fail loudly instead of expensively. |
| `code-reviewer` | reasoning-tuned | Reasoning-tuned models are measurably better at fault-finding than at-tier generalists. |
| `debugger` | reasoning-tuned | Same argument: isolating a root cause is a reasoning task, not a generation task. |
| `plan` (OpenCode built-in) | cheap | Routed explicitly so it doesn't compete with `tech-lead` for the expensive model. |

## The shipped profiles

**`config/opencode.personal.jsonc`** is a real, working configuration —
every ID in it was verified against `opencode models` output on the
authoring machine, and `validate.mjs` re-verifies them live whenever the
`opencode` binary is on `PATH`:

| Role | Model | Tier |
|---|---|---|
| `tech-lead` | `opencode/big-pickle` | strongest |
| `senior-dev` | `ollama/qwen3.5:27b` | large — **remote Ollama host** |
| `implementer` | `ollama-local/qwen2.5-coder:7b` | code-tuned mid |
| `boilerplate` | `ollama-local/gemma2:2b` | cheapest |
| `code-reviewer` | `ollama/deepseek-r1:7b` | reasoning — **remote Ollama host** |
| `debugger` | `ollama/deepseek-r1:7b` | reasoning — **remote Ollama host** |
| `plan` | `ollama-local/qwen2.5-coder:7b` | cheap |

The three **remote** rows all depend on the same remote Ollama host (the
`ollama/` provider, as opposed to `ollama-local/`). If that host is
unreachable they fail together. Local-only fallback: point all three at
`ollama-local/deepseek-coder-v2:16b`, the largest model on the local
instance.

**`config/opencode.work.jsonc`** is a template: same structure, same tier
comments, every model slot set to `"TODO"`. `validate.mjs` warns (not
errors) on each remaining `TODO` in the work profile, and errors on a `TODO`
in the personal one — the personal profile ships working, the work profile
ships fillable.

## Filling in the work profile

This is the canonical procedure for replacing the `TODO`s in
`config/opencode.work.jsonc`. Do it **on the work machine** — the whole
point is that Copilot model IDs cannot be verified anywhere else.

1. **List the real IDs.** On the work machine:

   ```bash
   opencode models | grep -i copilot
   ```

2. **Copy strings verbatim.** Copilot's model-picker display names
   ("Claude Sonnet 4.6", "GPT-5.4", …) are marketing labels, **not**
   OpenCode model IDs. A guessed or hand-slugged ID produces a config that
   fails at invocation time with an unhelpful error. Only strings copied
   character-for-character from the `opencode models` output are valid.

3. **Map IDs to tiers, not to fame.** Fill each slot with a model that
   satisfies the tier comment on its line — strongest for `tech-lead`, a
   strong mid for `senior-dev`, a code-tuned mid for `implementer`, the
   cheapest for `boilerplate` and `plan`, a reasoning-tuned model for
   `code-reviewer` and `debugger`. There are eight `TODO` slots: the
   top-level `model`, the six agents, and `plan`.

4. **Validate.** From the repo root:

   ```bash
   node scripts/validate.mjs
   ```

   The per-slot `TODO` warnings disappear as you fill them; a missing or
   typo'd agent key is an **error** (see the footgun below for why).

5. **Install.**

   ```bash
   ./scripts/install.sh --profile work
   ```

   This re-runs validation, regenerates the Claude Code mirrors, and merges
   the routing into `~/.config/opencode/opencode.jsonc` (your existing
   provider/MCP config is preserved; the original is backed up first).

6. **Record what you picked.** Add the chosen IDs to this file (a table like
   the personal one above) so the next routing edit can be checked against
   tier intent without re-deriving it.

While you're there, `benchmarks/pricing.json` contains `github-copilot/*`
keys that are **best-effort guesses** from Copilot's public model list —
rename them to the verified IDs too, or cost computation for benchmark runs
will silently return `n/a`.

## Claude Code mirrors

The generated `.claude/agents/*.md` mirrors are the one place model
assignment is **hardcoded** rather than routed through a profile. Claude
Code runs on a fixed subscription model set — the same aliases on every
machine — so there is nothing per-machine to route: each mirror carries a
`model:` alias pinned at generation time from the `CLAUDE_MODEL_BY_AGENT`
tier map in `scripts/sync-agents.mjs` (`fable` for `tech-lead` and
`senior-dev`, `sonnet` for `implementer`/`code-reviewer`/`debugger`,
`haiku` for `boilerplate`). Aliases are used instead of dated model IDs so
the mirrors don't rot as versions roll forward.

The source `agents/*.md` files stay model-free — that invariant is
unchanged and still enforced — and the OpenCode profiles have no effect on
mirror models. `validate.mjs` asserts the tier map covers exactly the six
agents, because a missing entry would mean that mirror defaults to
`model: inherit`, i.e. the caller's (most expensive) model — the same
footgun described below, on the Claude Code side. To change a mirror's
tier, edit the map and re-run `node scripts/sync-agents.mjs`.

## The model-inheritance footgun

The sharpest edge in this design, worth stating twice (the README warns
about it too):

**A subagent with no `model` entry in the config does not fall back to a
default — it inherits the model of its caller.** In this setup the caller
is always `tech-lead`, which runs the most expensive model in the fleet. So
a missing or typo'd `agent.<name>` key in the profile does not error; it
silently upgrades that worker — including `boilerplate`, whose entire reason
to exist is being cheap — to maximum spend.

The config-not-frontmatter decision makes this edge sharper: since agent
files deliberately carry no `model:` key, **the profile is the only thing
standing between you and every mechanical task running on the tech lead's
model**. Three defenses:

1. `node scripts/validate.mjs` asserts every one of the six agents has a
   non-empty `model` entry in **both** profiles and fails loudly otherwise.
   Run it after every hand-edit of a profile — and after any hand-edit of
   `~/.config/opencode/opencode.jsonc`, because a partially-merged config
   (install ran, then a key was dropped by hand) degrades to maximum spend,
   not to an error.
2. `install.sh` refuses to install anything if validation fails.
3. **Verify at runtime when in doubt:** the OpenCode TUI shows which model
   produced each session and message. Open a subagent's session after a
   delegation and read the model it reports — if a worker shows the tech
   lead's model, a routing entry is missing or misspelled.

## Feeding benchmark results back

The benchmark harness (see [../benchmarks/README.md](../benchmarks/README.md))
ranks models per task category — coding, reviewing, planning, debugging,
tests — using real reported token counts and mechanically-checked quality
assertions. When a run shows, say, a cheaper model matching the incumbent on
the `reviewing` category, acting on it is a **one-line edit** to the
relevant profile: change `agent.code-reviewer.model`, confirm the tier
comment still holds, run `node scripts/validate.mjs`, re-run
`./scripts/install.sh` (or just let the merged config pick it up on the next
merge). No agent file is touched.

Remember the harness's own caveat when reading its cost column: Copilot
bills by request quota, not tokens, so dollar figures are relative-efficiency
proxies, not bills.
