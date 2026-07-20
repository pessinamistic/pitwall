# Codex native-agent compatibility plan

## Outcome

Make the existing six-agent team installable and selectable in Codex CLI in
the same practical way it is in OpenCode and Claude Code.

The Codex-native target is **one TOML file per role**. Codex discovers project
agents in `.codex/agents/` and personal agents in `~/.codex/agents/`. Each
file supplies the role name, selection description, developer instructions,
and optional model, reasoning, sandbox, MCP, and skills settings.

That gives this repository a real named-agent registry in Codex: the agent
picker (`/agents`) can create or manage agents interactively, while the
checked-in files provide the reproducible, reviewable team definition.

## Current state and correction

The existing [`AGENTS.md`](../AGENTS.md) is useful shared engineering policy,
but it is not the complete Codex integration. It describes six operational
roles without registering them as native Codex agent types.

The earlier recommendation to avoid a Codex agent registry was wrong for the
current Codex CLI. Native custom agents are supported. Keep `AGENTS.md` for
repository-wide coordination rules **and** add `.codex/agents/*.toml` for the
six named roles.

## Target architecture

```text
                         ┌──> ~/.config/opencode/agents/     (OpenCode install)
agents/*.md ─────────────┤
                         ├──> .claude/agents/*.md            (Claude mirror)
                         │       └──> ~/.claude/agents/       (Claude install)
                         │
                         └──> .codex/agents/*.toml            (Codex project agents)
                                  └──> ~/.codex/agents/        (optional personal install)

AGENTS.md ───────────────────────────────────────────────> shared workflow,
                                                            review, and handoff
                                                            policy for Codex
```

`agents/*.md` remains the detailed role-prompt source. Its OpenCode
frontmatter is platform-specific; the Markdown body is the input for Codex
`developer_instructions`. `AGENTS.md` remains a small, durable policy that
governs how the six native roles are orchestrated in this repository.

## Codex role files

Create these generated, checked-in files:

```text
.codex/agents/tech-lead.toml
.codex/agents/senior-dev.toml
.codex/agents/implementer.toml
.codex/agents/boilerplate.toml
.codex/agents/code-reviewer.toml
.codex/agents/debugger.toml
```

Each file must contain the three fields Codex requires:

```toml
name = "code-reviewer"
description = "Read-only reviewer for a supplied diff; reports correctness, security, and test gaps."
developer_instructions = """
You are the Code Reviewer. Review only; do not edit files.
Report numbered blocker, should-fix, or nit findings with file:line references.
...
"""
```

The role name is the filename-compatible stable identity. `description` tells
Codex when to select that agent. `developer_instructions` is the translated
role prompt. The files may also set `model`, `model_reasoning_effort`,
`sandbox_mode`, `mcp_servers`, and `skills.config`; omitted keys inherit the
parent Codex session.

### Role mapping

| Existing role | Codex file | Initial model policy | Sandbox policy | Important translation |
| --- | --- | --- | --- | --- |
| `tech-lead` | `tech-lead.toml` | Strong model, `high` reasoning | Inherit parent | Plans, decomposes, owns review gates; no implementation unless explicitly requested. |
| `senior-dev` | `senior-dev.toml` | Strong model, `high` reasoning | Inherit parent | Architecture, security, migrations, concurrency, risky-diff review. |
| `implementer` | `implementer.toml` | General coding model, `medium` reasoning | Inherit parent | Fully specified implementation and focused tests. |
| `boilerplate` | `boilerplate.toml` | Faster/lower-cost model, `low` reasoning | Inherit parent | Mechanical edits only; returns ambiguity to lead. |
| `code-reviewer` | `code-reviewer.toml` | Strong model, `high` reasoning | `read-only` | Review only, with numbered `file:line` findings; never edits. |
| `debugger` | `debugger.toml` | General coding model, `high` reasoning | Inherit parent | Reproduce, isolate, diagnose, then make the smallest authorized fix. |

Use logical model tiers in the design, not hard-coded provider aliases copied
from Claude. At implementation time, choose model IDs that the team's Codex
account actually exposes. The current documented starting points are
`gpt-5.6` for demanding work and `gpt-5.6-terra` for faster, lower-cost work;
therefore the initial candidate map is:

```text
tech-lead, senior-dev, code-reviewer -> gpt-5.6 / high
implementer, debugger                -> gpt-5.6 / medium or high
boilerplate                           -> gpt-5.6-terra / low
```

Do not make this mapping unconditional. If a workspace does not permit a
listed model, omit `model` from the generated role file so the role inherits
the parent session model, while retaining its role instructions and reasoning
setting where supported.

### What maps cleanly, and what does not

| OpenCode source field | Codex-native mapping |
| --- | --- |
| filename | `name` in the TOML file |
| `description` | `description` |
| Markdown prompt body | `developer_instructions` |
| OpenCode model profile entry | `model` and `model_reasoning_effort` in the role TOML, selected by a Codex profile |
| `permission.edit: deny` | `sandbox_mode = "read-only"` for `code-reviewer`; also retain the no-edit instruction |
| `permission.task` / `mode` | role instructions plus Codex's native subagent orchestration; no direct field-for-field equivalent |
| `permission.bash`, `web*`, external-directory rules | parent sandbox, approval policy, and project configuration; do not silently translate them |
| `steps`, temperature, colour | omit; express task bounds in instructions and acceptance criteria |

All subagents inherit the parent turn's live sandbox and approval overrides.
Consequently, a read-only reviewer role is a useful default, but a parent
session's live permission choice can still take precedence. The written
read-only rule remains mandatory defense in depth.

## Implementation plan

### Phase 1 — define a single roster and Codex model profiles

1. Add `scripts/lib/team.mjs` and move the duplicated six-role list from
   `scripts/validate.mjs` and `scripts/sync-agents.mjs` into it.

   ```js
   export const TEAM_ROLES = [
     'tech-lead', 'senior-dev', 'implementer',
     'boilerplate', 'code-reviewer', 'debugger',
   ];
   export const WORKER_ROLES = TEAM_ROLES.filter((role) => role !== 'tech-lead');
   ```

2. Add a Codex-specific profile source, for example
   `config/codex.personal.jsonc` and `config/codex.work.jsonc`. It should
   map each role to an optional `model`, a `model_reasoning_effort`, and an
   optional sandbox default. Unlike OpenCode's configuration, these values
   are generator input, not files Codex reads directly.

3. Keep work-profile model values as explicit `TODO` placeholders until the
   team runs `codex` under that account and confirms the workspace model
   allowlist. Make validation warn—not fail—on those work placeholders.

4. Decide the personal profile from the installed CLI's available model
   names. Do not use Claude aliases (`fable`, `sonnet`, `haiku`) in any Codex
   artifact.

**Acceptance:** one roster is shared by all scripts; every Codex role has a
deliberate model/reasoning policy or an explicit inheritance choice.

### Phase 2 — add a deterministic Codex generator

1. Add `scripts/sync-codex-agents.mjs`.
2. Read every `agents/<role>.md` with the existing frontmatter parser.
3. Produce `.codex/agents/<role>.toml`, using:

   - `name`: filename without `.md`;
   - `description`: source frontmatter `description` after TOML escaping;
   - `developer_instructions`: source Markdown body in a TOML multiline
     basic string;
   - `model` and `model_reasoning_effort`: selected Codex profile values;
   - `sandbox_mode = "read-only"`: only for `code-reviewer`;
   - `nickname_candidates`: an optional unique, stable list for display only.

4. Include a generated-file comment at the top, analogous to the Claude
   mirror:

   ```toml
   # GENERATED from agents/code-reviewer.md by scripts/sync-codex-agents.mjs.
   # Do not hand-edit; edit the source prompt or Codex profile instead.
   ```

5. Use a real TOML string encoder. Do not concatenate a raw prompt into
   triple quotes: a source prompt containing `"""` must be escaped or cause
   a clear generator error. Keep the implementation dependency-free if a
   small, tested encoder suffices; otherwise add one TOML dependency only
   after approval.

6. Make generation idempotent: compare the intended content with the current
   file and report written/unchanged counts. Support `--check` to exit nonzero
   if generated files are stale; CI should use that mode.

7. Initially preserve the prompt body nearly verbatim, but remove or rewrite
   only platform-specific phrases that would be misleading in Codex (for
   example, OpenCode's stateless-worker assertion or explicit `Task` tool
   references). Keep the actual role responsibility, brief contract, review
   rule, and reporting format unchanged.

**Acceptance:** a clean clone can run the generator and obtain six valid
native Codex files, with no user-home mutation.

### Phase 3 — make project scope the default install path

1. Commit `.codex/agents/*.toml` to the repository. Codex will discover them
   when this project is trusted, so this is the default and recommended
   installation path.
2. Update `scripts/install.sh` to accept an explicit target selector:

   ```text
   ./scripts/install.sh --target all --profile personal
   ./scripts/install.sh --target opencode --profile work
   ./scripts/install.sh --target claude --profile personal
   ./scripts/install.sh --target codex --profile personal
   ```

3. The `codex` target must run validation and `sync-codex-agents.mjs`; it must
   not merge OpenCode JSONC into a Codex configuration file and must not
   modify `~/.codex/config.toml`.
4. Preserve the present no-argument behaviour as `--target all` only if it is
   safe for existing users. Otherwise retain the current OpenCode/Claude
   default and make Codex an explicit opt-in until a major-version release.

**Acceptance:** `--target codex` produces only repository files and works on
machines that have Node but neither OpenCode nor Claude Code installed.

### Phase 4 — offer an optional personal/system install

Project scope is ideal for a repository-specific engineering team. If the
same six roles are wanted in every project on one machine, add a separate,
explicit command:

```text
./scripts/install.sh --target codex --scope user --profile personal
```

Its rules must be stricter than the existing broad directory replacement:

1. Generate `.codex/agents/*.toml` first and validate it.
2. Create `~/.codex/agents/` if absent.
3. Install only the six named TOML files; never delete unrelated personal
   agents.
4. If a target file exists and is not a symlink managed by this repository,
   stop and report the conflict. Do not overwrite it.
5. Back up a managed target before replacing it, then create a relative or
   absolute symlink to the generated project file. Record installed names in
   a small manifest so uninstall can remove only managed links.
6. Provide `--dry-run` and `--uninstall`; neither may touch
   `~/.codex/config.toml`.

This makes the system installation comparable to OpenCode's install step
without taking ownership of a user's unrelated Codex agents or global config.

**Acceptance:** the command is reversible, never removes unrelated files,
and `/agents` shows the six installed role names in a new Codex CLI session.

### Phase 5 — validation and CI

1. Add `scripts/validate-codex.mjs`, a dependency-free, read-only validator.
   It should verify:

   - the six expected `.codex/agents/<role>.toml` files exist;
   - each has non-empty `name`, `description`, and
     `developer_instructions`;
   - the `name` exactly matches its filename and the shared roster;
   - every agent body includes the applicable team responsibility;
   - `code-reviewer` is read-only in both instructions and sandbox setting;
   - models, when set, are strings and reasoning effort is a supported value;
   - no file contains OpenCode/Claude-only model aliases; and
   - `AGENTS.md` contains the shared worker-brief and review rules.

2. Refactor the existing validator behind platform selectors:

   ```text
   node scripts/validate.mjs --platform all       # CI/default
   node scripts/validate.mjs --platform opencode
   node scripts/validate.mjs --platform claude
   node scripts/validate.mjs --platform codex
   ```

3. Add these CI checks, in order:

   ```text
   node scripts/sync-codex-agents.mjs --profile personal --check
   node scripts/validate.mjs --platform codex
   node scripts/validate.mjs --platform all
   ```

4. Keep `opencode models` as a warning when the binary is unavailable. Codex
validation must not require OpenCode, and OpenCode validation must not require
the Codex CLI except for an optional local smoke test.

**Acceptance:** CI detects stale generated Codex files, a missing role, a
wrong name, invalid TOML, accidental model aliases, and a reviewer that lost
its read-only constraint.

### Phase 6 — update shared documentation and run a smoke test

1. Correct `AGENTS.md` and [`docs/codex.md`](codex.md): Codex does support
   named custom agents; `AGENTS.md` complements rather than replaces them.
2. Document both scopes, the target-selection command, model-profile policy,
   limits of OpenCode permission translation, and the `--uninstall` path in
   the README.
3. Keep the prompt bodies and this document as the role-behaviour source of
   truth. Any change to a role must run both `sync-agents.mjs` and
   `sync-codex-agents.mjs` before commit.
4. In a fresh interactive Codex CLI session opened at the repository root,
   run `/agents` and verify all six roles appear. Spawn `code-reviewer` on a
   harmless read-only review task and verify it cannot edit; spawn
   `boilerplate` on a mechanical task and inspect its assigned model/reasoning
   configuration.

## Non-goals and safety boundaries

- Do not put secrets, account auth, provider URLs, or personal configuration
  into `.codex/agents/*.toml`.
- Do not mutate `~/.codex/config.toml`; it is user/environment-owned.
- Do not treat OpenCode `permission` maps as security-equivalent in Codex.
  Codex subagents inherit parent runtime sandbox/approval overrides.
- Do not enable nested agent delegation by default. Keep
  `agents.max_depth = 1` so only the lead can fan out; this avoids recursive,
  expensive delegation.
- Do not parallelize overlapping write tasks. Codex agents share the
  workspace, so write-heavy work must be sequenced or isolated in worktrees.

## Rollout sequence

1. Build Phase 1–2 on a feature branch and commit the generated `.toml`
   files.
2. Run the project-scope smoke test with `/agents`; fix only confirmed format
   or role-selection issues.
3. Merge project scope, validation, and docs.
4. Add the optional personal/system installer only after project scope is
   stable for one release cycle.
5. Later, add a work profile after confirming the organisation's available
   Codex models and permission policy.

## Done definition

This migration is complete when a trusted clone of this repository exposes
the six named Codex roles through `/agents`, their instructions are generated
from the maintained role prompts, their configured model/reasoning defaults
match the selected profile or deliberately inherit, the reviewer defaults to
read-only, generated files are checked in and CI-validated, and the optional
user install is conflict-safe and reversible.

## Sources

- [Codex configuration reference](https://developers.openai.com/codex/config-reference/)
  — project configuration, `agents.<name>` settings, and thread limits.
- [Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)
  — custom-agent locations and schema, model/reasoning configuration, and
  sandbox inheritance.
