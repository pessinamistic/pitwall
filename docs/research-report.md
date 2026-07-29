# Scuderia — Research Report
*Gaps, Hermes integration, and theme extensions*

---

## 1. Gaps and improvements

### 1.1 Missing `scripts/worktree-cleanup.sh`

`AGENTS.md` references `scripts/worktree-cleanup.sh` as a command every tech-lead should run to
sweep stray worktrees and branches. The file does not exist in the repo. Any agent or contributor
following the AGENTS.md instructions hits a dead reference immediately. Either create the script
or remove the reference.

Minimal fix:
```bash
#!/usr/bin/env bash
# Remove all git worktrees that are not the main checkout and delete their tracking branches.
set -euo pipefail
for wt in $(git worktree list --porcelain | awk '/worktree/{print $2}' | tail -n +2); do
  branch=$(git worktree list --porcelain | grep -A3 "worktree $wt" | awk '/branch/{print $2}' | sed 's|refs/heads/||')
  git worktree remove --force "$wt"
  [ -n "$branch" ] && git branch -D "$branch" 2>/dev/null || true
done
```

---

### 1.2 Model tier mismatch in Claude Code mirrors

In `scripts/sync-agents.mjs`, `CLAUDE_MODEL_BY_AGENT` currently maps:

| role            | alias    | intended tier |
|-----------------|----------|---------------|
| `tech-lead`     | `opus`   | strongest     |
| `senior-dev`    | `sonnet` | mid           |
| `implementer`   | `sonnet` | mid           |
| `boilerplate`   | `haiku`  | cheapest      |
| `code-reviewer` | `sonnet` | mid           |
| `debugger`      | `sonnet` | mid           |

The README and `docs/model-routing.md` both say `code-reviewer` and `debugger` should be on a
*reasoning-tuned* tier, not a general mid-size model. On Claude Code the reasoning alias is
`fable` (or at minimum `opus`). `sonnet` is a generation model, not a reasoning model. This
silently under-powers two roles whose entire value proposition is chain-of-thought fault finding.

The previous commit message ("fix: update model assignment for senior developer role from opus
to sonnet") shows `senior-dev` was intentionally moved down, but `code-reviewer` and `debugger`
deserve a comment explaining why they're also on `sonnet` instead of a reasoning tier — or they
should be bumped back.

---

### 1.3 Boilerplate bash allowlist is stack-specific

`agents/boilerplate.md` allows:
```yaml
bash:
  "*": ask
  "npm test*": allow
  "npm run lint*": allow
  "./gradlew *": allow
  "mvn *": allow
```

This is wired to a JS/Java stack. A project using `pytest`, `cargo test`, `go test`, `make check`,
or `deno task` would have `boilerplate` silently ask for every verification command, breaking the
20-step cap and making the "cheap role that verifies cheaply" promise false.

Since the allowlist is in the source `agents/boilerplate.md` (shared across harnesses), it needs
to either be broader (add common runners) or the `<!-- CUSTOMIZE: ... -->` pattern should be
applied here so installers know to extend it for their stack.

---

### 1.4 Only one benchmark result in the repo

`benchmarks/results/` holds a single run from 2026-07-19. The benchmark harness is the entire
justification for data-driven model routing instead of vibes-based assignment. With one result:

- No trend data across model generations.
- No cross-category comparison (only `coding` is present; `debugging`, `planning`, `reviewing`,
  `tests` have zero results).
- The benchmark-driven routing workflow described in `docs/model-routing.md` is aspirational,
  not operational.

Improvements:
- Run benchmarks across all 5 prompt categories before changing any model assignment.
- Store result files in a `benchmarks/results/` subfolder per category so they can be tracked
  separately.
- Consider a Hermes cron job (see section 2) to run benchmarks on a schedule and
  deliver a summary report.

---

### 1.5 Work config profiles remain all-TODO

`config/opencode.work.jsonc` and `config/codex.work.jsonc` ship as templates full of `"TODO"`
placeholders. The fill procedure (`opencode models | grep -i copilot`, copy verbatim) is documented
in `docs/model-routing.md` but is manual and machine-specific.

The gap: there is no interactive wizard, no validation feedback loop during filling, and nothing
that tells a new contributor they need to do this before their first delegation. `validate.mjs`
warns on TODO values but only *after* the user knows to run it. The install script should detect
an unfilled work profile and prompt the user during install rather than silently succeeding.

---

### 1.6 Antigravity has no in-session delegation

The Antigravity integration requires the human to manually switch agents in the `/agents` panel
between delegations. There is no in-session agent-to-agent invocation. This makes the tech-lead
orchestration model a fiction: the human becomes the message bus, and any chain of work (tech-lead
→ implementer → code-reviewer → back to tech-lead) requires 4 manual panel switches.

Fleet mode with `--backend antigravity` partially solves this for non-interactive parallel tasks,
but it bypasses the tech-lead → worker hierarchy entirely.

This is a platform limitation, not something fixable in this repo, but the documentation
undersells how significant it is. The Antigravity integration is closer to "six independent
role prompts you can switch between" than "an orchestrated team".

---

### 1.7 Codex agents have no skill discovery

The 13 skills in `.claude/skills/` reach OpenCode, Claude Code, and Antigravity, but Codex CLI
has no skill-discovery mechanism. Skills like `delegate-first`, `bearings`, and `learnings-curator`
are invisible to Codex agents. The Codex TOML frontmatter has no `skills:` equivalent.

Current workaround: inline the relevant skill content into the Codex agent TOML body for the
roles that need it. This duplicates content and diverges from the single-source-of-truth principle.

The `docs/codex.md` acknowledges this but offers no workaround. Add one or acknowledge it as a
known limitation that should influence whether Codex is listed in `--target all`.

---

### 1.8 Fleet mode has no disjoint-file enforcement

`AGENTS.md` says "only parallelize subagents when they touch disjoint files" but fleet mode
spawns any roles the user requests with no check. If two fleet tasks both write to, say,
`src/main/resources/application.yml`, the last one to finish wins silently.

The pit-wall could at minimum log a warning when multiple spawned tasks are given briefs that
mention the same file path. Pattern matching on the brief string is imperfect but better than
nothing.

---

### 1.9 Skills are Java/Spring Boot specific; no generic fallback

10 of 13 skills assume a Java 21 / Spring Boot / Kafka / Postgres / Kubernetes stack. A team
using Python/FastAPI, TypeScript/Node, Rust, or Go gets no stack-level skills at all. The
`<!-- CUSTOMIZE: ... -->` markers acknowledge this, but a user who installes the repo for a
non-Java project ends up with 10 skills whose content actively misleads (wrong test runner,
wrong migration tooling, wrong import conventions).

Minimum improvement: add a `stack-conventions` skill skeleton (nearly empty, all
`<!-- CUSTOMIZE -->`) that tells a new user exactly what to fill in rather than leaving them
to discover the Java skills don't apply.

---

### 1.10 Stray files in the repo root

The repo root contains:
- `chatgpt_output.txt` — appears to be scratch output from an early ChatGPT session
- `antigravity_chat_session.txt` — likewise
- `RESUME_HANDOFF.md`, `TECH_LEAD_HANDOFF.md`, `bearings-2026-07-22.md` — session state
  artifacts that belong in `.agents/` (per the bearings skill convention) or should be
  gitignored

These don't hurt functionality but clutter the repo and confuse new contributors. Add a
`.gitignore` rule for `*-handoff.md`, `bearings-*.md` at root level, and the chat output files,
and move the existing ones to `.agents/` or delete them.

---

### 1.11 CI doesn't validate fleet mode or Antigravity staleness

The CI workflow validates OpenCode, Claude Code, and Codex generated files via `--check` flags.
Fleet agent staleness is checked by `validate.mjs --platform opencode` (inlined into it), but:

- There is no explicit `node scripts/sync-fleet-agents.mjs --check` step visible in CI.
- Antigravity generated files under `.agents/agents/` are not drift-checked in CI (only
  `validate.mjs --platform antigravity` which checks frontmatter shape, not content staleness).

Add `node scripts/sync-antigravity-agents.mjs --check` to the `drift-gate` job alongside
the existing sync `--check` steps.

---

### 1.12 No PR template

The `docs/writing-briefs.md` document is excellent, but there's no `.github/PULL_REQUEST_TEMPLATE.md`
that enforces the brief contract on contributions. A new contributor submitting a PR without
verification results is indistinguishable from one who ran the checks. The CI validates
structural correctness; a PR template can validate workflow compliance ("I ran
`node scripts/validate.mjs --platform all` and it exits clean").

---

## 2. Hermes integration

Hermes is a local AI assistant CLI with persistent skills, cron jobs, MCP tools, and a memory
system. This project can integrate with Hermes on three levels.

---

### 2.1 Port the skills into Hermes's skill store

Hermes skills live in `~/.hermes/skills/<name>/SKILL.md` and use the same frontmatter schema
(`name`, `description`, `metadata`) as Claude Code skills. The 13 skills in `.claude/skills/`
are already compatible with Hermes's format.

**Add a `hermes` install target to `scripts/install.sh`:**

```bash
# Install target: hermes
# Symlinks .claude/skills/*/ into ~/.hermes/skills/
HERMES_SKILLS_DIR="${HOME}/.hermes/skills"
mkdir -p "$HERMES_SKILLS_DIR"
for skill_dir in "$REPO_ROOT/.claude/skills"/*/; do
  skill_name="$(basename "$skill_dir")"
  target="$HERMES_SKILLS_DIR/$skill_name"
  if [ -L "$target" ] || [ ! -e "$target" ]; then
    ln -sfn "$skill_dir" "$target"
    echo "hermes: linked skill $skill_name"
  else
    echo "hermes: skipped $skill_name (real directory already exists, not overwriting)"
  fi
done
```

Add `hermes` to the `--target` comma-list alongside `opencode`, `claude`, `codex`, `antigravity`.
Update `validate.mjs` to check Hermes skill symlinks, and `doctor.sh` to verify `~/.hermes`
exists (i.e., Hermes is installed).

After installation, users can invoke any skill directly in Hermes:
```
/delegate-first
/java
/kafka
```

---

### 2.2 Create a `scuderia` Hermes skill that adapts the team for Hermes's delegate_task tool

Hermes's `delegate_task` tool is a first-class subagent dispatch mechanism — it is functionally
equivalent to OpenCode's `Task` tool. The six roles map cleanly onto Hermes's parallel/serial
delegation model.

Create `.claude/skills/scuderia/SKILL.md` (which would also install into `~/.hermes/skills/scuderia/`):

```markdown
---
name: scuderia
description: >-
  Activates the six-role Scuderia engineering team for Hermes's delegate_task
  tool. Turns the running agent into a tech-lead orchestrator: decompose
  multi-step work, delegate each piece to the appropriate role via
  delegate_task, gate on review, verify. Use whenever a task is multi-step,
  involves multiple files, or needs a code review or debug pass.
metadata:
  layer: practice
---

## The six roles and how they map to delegate_task

| Role | delegate_task goal shape |
|---|---|
| tech-lead | Used only when you need a second orchestrator to plan a sub-scope |
| senior-dev | "Act as senior-dev: [design/security/schema/concurrency task]..." |
| implementer | "Act as implementer: [fully-specified feature with paths + pattern]..." |
| boilerplate | "Act as boilerplate: [mechanical zero-judgment task]..." |
| code-reviewer | "Act as code-reviewer (read-only): review this diff and return numbered file:line findings..." |
| debugger | "Act as debugger: reproduce → isolate → diagnose → fix for [failure description]..." |

## Delegation pattern

Every delegate_task call for a role should include in 'goal':
1. The role's persona instruction: "Act as [role] from the Scuderia team."
2. Exact file paths to create or modify.
3. A pattern file to imitate.
4. Acceptance criteria and the project's verification command(s).
5. Any interface contracts parallel tasks depend on.

Pass relevant context via the 'context' field, not inline in 'goal'.

## Parallel vs. serial

- Batch independent tasks in one delegate_task 'tasks' array (up to 3 concurrent).
- Serialize tasks that write the same file(s).
- Always run code-reviewer after implementer/senior-dev before accepting work as done.

## Verification gate

Never accept a subagent report that lacks:
- The exact command run.
- Its actual output (pass/fail, not "should pass").
Re-run the verification yourself for risky diffs (security, schema, concurrency).
```

---

### 2.3 Benchmark cron job via Hermes

The benchmark harness (`benchmarks/run.mjs`) is a standalone Node script that produces a
markdown report. Hermes cron jobs can run scripts and deliver results to a configured channel.

Add a Hermes cron job to run benchmarks nightly or weekly:

```
hermes cron create \
  --name "scuderia-bench" \
  --schedule "0 2 * * 1" \
  --prompt "Run the Scuderia benchmark harness and summarize results:
    1. cd /path/to/opencode_agents
    2. Run: node benchmarks/run.mjs --models ollama-local/qwen2.5-coder:7b,ollama-local/gemma2:2b --prompt benchmarks/prompts/coding.md
    3. Run: node benchmarks/run.mjs --models ... --prompt benchmarks/prompts/debugging.md
    4. Run: node benchmarks/report.mjs --dir benchmarks/results/
    5. Report the quality rankings per category and any model whose tier assignment looks mismatched."
```

This closes the feedback loop: instead of running benchmarks manually when you remember to,
you get a weekly digest that surfaces routing candidates automatically.

---

### 2.4 Hermes memory integration for learnings

The `.agents/learnings.md` file is a per-project scratch memory for task-specific gotchas.
Hermes has a persistent memory store (`memory` tool) scoped to the user's profile. The two
systems are complementary:

- `.agents/learnings.md` — project-scoped, shared via git, read by agents via the bearings
  and learnings-curator skills.
- Hermes memory — user-scoped, cross-project, persists in `~/.hermes/memories/`.

Pattern: when a learnings entry is promoted out of project scope by the `learnings-curator`
skill (it "outgrows a task-specific gotcha"), the curated text should also be written into
Hermes memory so it travels with the user across projects.

Add a note to the `learnings-curator` skill:
```markdown
## Graduating to Hermes memory
When an entry is promoted to AGENTS.md or ~/.claude/CLAUDE.md, also consider
saving it to Hermes memory if it is cross-project (e.g. a platform quirk, a
tool behavior that affects all projects). Use the Hermes `memory` tool with
target='memory' and a compact, declarative fact.
```

---

### 2.5 `hermes` as a fleet backend

Fleet mode's `pit-wall.sh spawn` already supports `--backend opencode` and
`--backend antigravity`. Hermes provides a CLI entry point (`hermes`) that can run
prompt-based tasks non-interactively.

Add `--backend hermes`:
```bash
# In scripts/fleet/lib/common.sh
# backend: hermes
# Launch: hermes run --skill scuderia "Act as <role>: <brief>"
```

This gives fleet mode a third backend that routes through Hermes's toolset (file, terminal,
browser, MCP) rather than OpenCode's. Particularly useful when the task needs tools Hermes
has that OpenCode doesn't (e.g. browser interaction, Telegram delivery of results).

---

## 3. Theme improvements

The Scuderia Ferrari metaphor is one of the strongest things about this project — it's
internally consistent, gives every role a concrete personality, and makes the otherwise-dry
topic of multi-agent orchestration memorable. The improvements below extend the metaphor
without diluting it.

---

### 3.1 Map the development workflow to the F1 race weekend

The current theme is role-centric (who is in the garage) but not workflow-centric (when does
what happen). F1 weekends have a fixed cadence that maps cleanly onto a feature's lifecycle:

| F1 phase | Dev phase | Who |
|---|---|---|
| **Free practice** | Exploration / spike | Unrouted session, or `bearings` skill |
| **Qualifying** | Tech-lead planning pass | `tech-lead` decomposes and briefs |
| **Pit-stop** | Delegation to a worker | `implementer`, `boilerplate`, `senior-dev` |
| **Safety car** | Blocked / wedged task | Fleet `wedged` status → human intervention |
| **Race engineer radio** | Tech-lead briefing the worker | The task brief itself |
| **Parc fermé / scrutineering** | Code review gate | `code-reviewer` |
| **Post-race debrief** | Learnings curation | `learnings-curator` skill |
| **Between-race testing** | Benchmark harness | `benchmarks/run.mjs` |

Adding this table to the README (or a new `docs/race-weekend.md`) gives new users a mental
model of *when* to use each role, not just which role does what.

---

### 3.2 Extend the pit wall board with F1-style flag states

The current fleet status board uses plain text statuses (`running`, `idle`, `wedged`, `done`,
`gone`). Map these to F1 flag colors in the terminal output using ANSI codes:

| Status | F1 flag | Color |
|---|---|---|
| `running` | Green flag | `\033[32m` |
| `idle` | Yellow flag — caution | `\033[33m` |
| `WEDGED` | Red flag — session halted | `\033[31m` (already uppercase, add red) |
| `done` | Chequered flag | `\033[37m` + `✓` |
| `gone` | Black flag — disqualified | `\033[90m` (dark grey) |

This is a 5-line change to `scripts/fleet/lib/supervise.sh` or `pit-wall.sh`'s print functions.

---

### 3.3 Add tifosi-style excitement to the tech-lead sign-off

The tech-lead already signs off with `Grazie, ragazzi.` on a clean gate. The other roles have
no sign-off equivalent. Give each role a closing line in its persona section that fires when
reporting back clean — short, in-character, never annoying:

| Role | Sign-off |
|---|---|
| `tech-lead` | `Grazie, ragazzi.` (already present) |
| `senior-dev` | `Architecture holds. We race.` |
| `implementer` | `Bolt torqued. Ready to leave the garage.` |
| `boilerplate` | `Tyres fitted. Done.` |
| `code-reviewer` | `Scrutineering passed. / N blockers found — not cleared for parc fermé.` |
| `debugger` | `Telemetry read. Root cause confirmed.` |

These are 1-line additions to each `agents/*.md` reporting section and carry through to all
generated mirrors automatically.

---

### 3.4 Rename `bearings` to a race-context metaphor

The `bearings` skill generates a "pick up where I left off" snapshot. The F1 equivalent is
the **debrief sheet** the race engineer reads at the start of the next session. Rename or alias
the skill trigger to `/debrief` (with `/bearings` kept as a backward-compatible alias).

This is a cosmetic-only change in the skill frontmatter's `description` trigger phrase — zero
functional impact, but it makes the skill's purpose immediately obvious to someone already
inside the Ferrari metaphor.

---

### 3.5 Role avatar SVGs: add a persona caption

The `assets/roles/` directory has 6 SVGs (one per role). Looking at `assets/roster.svg`, they
appear to be icon-style images. Adding a one-line caption under each icon in `roster.svg` that
maps the F1 title to the agent name more explicitly would help:

```
tech-lead        → Race Engineer
senior-dev       → Technical Director
implementer      → Race Mechanic
boilerplate      → Tyre Technician
code-reviewer    → FIA Scrutineer
debugger         → Telemetry Engineer
```

This information is already in the `roster.svg` alt text per the README, but making it visible
in the image itself means a first-time visitor on GitHub understands the hierarchy from the
banner before reading a single word of prose.

---

### 3.6 `docs/race-weekend.md` — a single-page workflow guide

Create a companion page that walks through a complete feature from idea to merge using the
Scuderia metaphor end-to-end, with actual commands at each step:

```
1. Arrive at the circuit (clone / cd into project)
2. Practice session — run /bearings (or /debrief) to see where we left off
3. Qualifying — brief the tech-lead with the feature request
4. Pit stops — watch the delegation chain in OpenCode or fleet mode
5. Safety car — how to handle a wedged task
6. Scrutineering — the code-reviewer gate
7. Podium — merge to main
8. Post-race debrief — /learnings-curator to capture the session's gotchas
```

This page replaces the "then start opencode and select tech-lead" paragraph in the README
quickstart with something that teaches the *workflow* not just the *invocation*.

---

*End of report.*
