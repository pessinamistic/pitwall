# Model cost/quality benchmark harness

Runs the same prompt against multiple OpenCode models (`opencode run --model
<id>`), records latency/tokens/cost, and produces a markdown report ranking
models per task category. The point is to let agent -> model routing in
`config/*.jsonc` be tuned from data instead of vibes.

## Two honest caveats (read before trusting the numbers)

This harness is built *around* these, not papered over them.

1. **Cost is a proxy, not a bill.** Through a GitHub Copilot subscription,
   cost is not per-token — Copilot bills by request/premium-request quota.
   The dollar figures in `pricing.json` and in the report are computed from
   each provider's *public per-token API pricing*, which is a reasonable
   proxy for the *relative* cost efficiency of one model vs. another, but it
   is not what a Copilot seat actually costs you. Don't paste the report's
   cost column into a budget spreadsheet.

2. **Quality is not a score.** A single LLM judge scoring another model's
   output (the classic "rate this 92/100") is not reliable, and implies a
   precision the method doesn't have. Instead, every prompt in
   `benchmarks/prompts/` ships an `expects:` list of objective, mechanically
   checkable assertions (a plain substring, or a `/regex/flags` pattern)
   which `report.mjs` checks against the model's raw output text with plain
   string/regex matching — no model judging another model. The report's
   Quality column is either `N/M checks (auto)` or `manual review needed`
   (when a run produced no usable output). It is deliberately not a
   percentage or a single number implying more precision than "grep found
   these patterns."

## Cross-provider comparison is work-machine-only

`pricing.json` includes `github-copilot/*` entries for the Claude/GPT/Gemini
families Copilot is likely to expose, priced from each provider's public
pricing page. **GitHub Copilot is not available on this (personal)
machine**, so those entries are unverified here in two ways:

- The model-ID *keys* (e.g. `github-copilot/claude-sonnet-5`) are best-effort
  slugs guessed from Copilot's model-picker display names. They are **not**
  confirmed OpenCode provider IDs. Per docs/model-routing.md, run
  `opencode models | grep -i copilot` on the work machine and use those
  exact strings — guessed IDs fail at invocation time with an unhelpful
  error.
- Even with correct IDs, you can only actually *run* `github-copilot/*`
  models where Copilot is configured, i.e. the work machine.

On this machine, only the `ollama/*`, `ollama-local/*`, and `opencode/*` rows
in `pricing.json` are runnable, and they're all null-priced (local/free) — so
the only thing a benchmark run here tells you is which *local* model is
fastest/best for a category, not how it stacks up against a Copilot model on
cost. That's still useful (routing among local models), just not the
Copilot-vs-Copilot comparison the project ultimately wants.

## Usage

```bash
node benchmarks/run.mjs \
  --models ollama-local/llama3.2:1b,ollama-local/gemma2:2b \
  --prompt benchmarks/prompts/coding.md \
  --timeout 300

node benchmarks/report.mjs benchmarks/results/<the-file-it-just-wrote>.json
# or, to fold every result file in the directory into one report:
node benchmarks/report.mjs --dir benchmarks/results/
```

`run.mjs` flags:

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--models` | yes | - | Comma-separated OpenCode model IDs |
| `--prompt` | yes | - | Path to a file in `benchmarks/prompts/` |
| `--timeout` | no | `300` | Per-model wall-clock timeout, seconds |
| `--out` | no | `benchmarks/results/` | Where to write the result JSON |

The `opencode` binary is resolved from `$OPENCODE_BIN`, falling back to
`opencode` on `PATH` — never a hardcoded absolute path, so this works
unmodified on both the personal and work machines.

Each model runs in its own throwaway temp directory (`opencode run --dir
<tmp>` plus a matching process `cwd`) so that if a model tries to actually
invoke a write/bash tool instead of just answering in text (small local
models occasionally do), it can't touch this repo. Models run **sequentially**,
one at a time, to avoid resource contention on local Ollama models sharing
one machine's CPU/GPU.

Per-model failures (bad model ID, timeout, non-zero exit, spawn failure) are
caught and recorded as an `error` field in that model's result record; the
run continues with the remaining models rather than aborting.

## Token counting: reported vs. estimated

`opencode run --format json` streams newline-delimited JSON events. A
`step_finish` event includes a `tokens` object (`{ input, output, reasoning,
total, cache }`) with the real usage numbers the provider returned. When
that's present, `run.mjs` uses it directly and sets `"token_source":
"reported"`. Reasoning tokens (nonzero on reasoning-tuned models like
`deepseek-r1`) are folded into `output_tokens` for cost purposes, matching
how providers typically bill "thinking" output.

If a run errors out before any `step_finish` event ever arrives (spawn
failure, timeout, bad model ID), there is nothing to report, so `run.mjs`
falls back to `"token_source": "estimated"`: `ceil(chars / 4)` on the prompt
text for input, and on however much output text was captured before failure.

This was determined by running `opencode run --help` (which surfaces
`--format json` as a raw-events output mode) and then actually invoking
`opencode run --model <id> --format json "<test prompt>"` and inspecting the
event stream — not assumed from documentation.

## Prompt file format

Each file in `benchmarks/prompts/` starts with a small frontmatter block:

```
---
category: coding
expects:
  - "a plain substring, case-insensitive"
  - "/a (regex|pattern)/i"
---

<the actual prompt sent to the model>
```

`report.mjs` checks each `expects` entry against the model's raw output text
by substring or regex match and reports the pass count — see Caveat 2 above
for why it stops there instead of trying to judge correctness semantically.

## Result JSON schema

One file per `run.mjs` invocation, named `<timestamp>-<category>.json` in
`--out` (default `benchmarks/results/`, gitignored except for `.gitkeep` —
don't commit run output):

```jsonc
{
  "generated_at": "2026-07-19T...",
  "category": "coding",
  "prompt_file": "benchmarks/prompts/coding.md",
  "expects": ["...", "..."],
  "timeout_s": 300,
  "opencode_bin": "opencode",
  "results": [
    {
      "model": "ollama-local/llama3.2:1b",
      "latency_ms": 1234,
      "input_tokens": 2050,
      "output_tokens": 98,
      "token_source": "reported",
      "cost_usd": null,
      "exit_code": 0,
      "timed_out": false,
      "error": null,
      "output_text": "..."
    }
  ]
}
```

## Updating pricing

Prices in `pricing.json` are a point-in-time snapshot (`as_of` per entry) from
each provider's own pricing page (`source` URL per entry). Re-check the
source before trusting an old snapshot, especially for `claude-sonnet-5`,
whose introductory pricing is explicitly time-boxed (rises 2026-09-01) and
for the Gemini Pro tiers, which are priced differently above/below 200k
tokens (this file uses the lower/short-context tier only — see each entry's
`notes`).
