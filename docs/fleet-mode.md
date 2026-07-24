# Fleet mode (optional)

An alternate, opt-in way to run the roster: instead of one `tech-lead`
session delegating in-session, each role runs as its own top-level
`opencode` process in its own tmux window, watched over by a supervisor that
renders a live "pit wall" board. Lives entirely in `scripts/fleet/`; needs
`tmux` installed and nothing else.

> [!WARNING]
> **Fleet mode bypasses the permission-enforced tech-lead → worker
> hierarchy.** Every pane it spawns is an independent, top-level agent
> running a role prompt (`opencode run --agent fleet-<role> "<brief>"` —
> see "The opencode backend: fleet-`<role>` agents" below for what
> `fleet-<role>` is and why it isn't just `<role>`) — not a
> subagent the tech lead delegated to under its `permission.task` allowlist
> (see the root README's ["How orchestration is
> enforced"](../README.md#how-orchestration-is-enforced)). There is no
> tech-lead review gate between tasks, and nothing stops you from spawning
> `senior-dev` or `tech-lead` itself as a bare top-level pane.
>
> Use fleet mode when you want to fire off several **independent** tasks in
> parallel and walk away — e.g. one pane per unrelated ticket. Use normal
> in-session orchestration (a `tech-lead` session delegating via the Task
> tool) when you want the enforced brief/review contract on a single body of
> work. The two are separate modes, not a spectrum — pick per task, don't mix
> them for the same piece of work.

## Commands

All commands go through `scripts/fleet/pit-wall.sh` (`FLEET_ROLES`:
`tech-lead`, `senior-dev`, `implementer`, `boilerplate`, `code-reviewer`,
`debugger`):

### Backends

`spawn` supports two backends, selected with `--backend <opencode|antigravity>`
or the `SCUDERIA_FLEET_BACKEND` env var (default `opencode`, unchanged
behavior from before this flag existed):

- **`opencode`** (default) — `opencode run --agent fleet-<role> "<brief>"`.
  Note the `fleet-` prefix: see "The opencode backend: fleet-`<role>`
  agents" below for why a top-level fleet task can't just target the bare
  `<role>` name the rest of this repo uses.
- **`antigravity`** — `agy --agent oc-<role> --print "<brief>"`, routing the
  task through your Antigravity/Gemini account instead of paid Claude/OpenCode
  credits. Targets the `oc-<role>` custom agents that `antigravity/install.sh`
  installs (see [`antigravity/README.md`](../antigravity/README.md)) — run
  that installer at least once first, and make sure `agy` is authenticated.
  `agy` calls are subject to your account's own plan quota; a spawned task can
  fail with a quota error independent of anything in this repo — check the
  pane (`pit-wall.sh attach <task-id>`) if a task looks `done` unexpectedly
  fast.

`SCUDERIA_FLEET_LAUNCH_CMD` (below) overrides both backends unconditionally.

| Command | Does |
|---|---|
| `spawn <role> ["--backend opencode\|antigravity"] "<brief>"` | Launches `<role>` as its own process in a new tmux window (`opencode` by default, or `agy` with `--backend antigravity`); assigns it a task id like `implementer-1`. |
| `view [--watch]` | Prints the pit-wall board once, or with `--watch`, clears and redraws it every `SCUDERIA_FLEET_POLL` seconds. |
| `supervise [--forever]` | Runs the status-polling loop in the foreground until every task is `done`/`gone`, or forever with `--forever`. |
| `watch [--forever]` | Backgrounds `supervise` (forwarding `--forever`) and then runs `view --watch` in the foreground — the usual way to drive fleet mode interactively. |
| `attach <task-id>` | Jumps your terminal to that task's tmux window (selects it in-place if you're already inside tmux). |
| `status` | One line per task, tab-separated: `id  role  status` — the machine-readable view. |
| `teardown [<task-id>\|--all]` | Kills a single task's window and clears its state, or with `--all`, kills every task window, stops the supervisor daemon, and wipes all task state. |

### Example session

```
$ scripts/fleet/pit-wall.sh spawn implementer "add the /healthz endpoint per docs/api-conventions.md"
pit-wall: spawned implementer-1  (role=implementer, window=@3)
  view:   scripts/fleet/pit-wall.sh view --watch
  attach: scripts/fleet/pit-wall.sh attach implementer-1

$ scripts/fleet/pit-wall.sh spawn code-reviewer "review the diff implementer-1 produces"
pit-wall: spawned code-reviewer-2  (role=code-reviewer, window=@4)
  view:   scripts/fleet/pit-wall.sh view --watch
  attach: scripts/fleet/pit-wall.sh attach code-reviewer-2

$ scripts/fleet/pit-wall.sh watch

  SCUDERIA — PIT WALL        20260722-101500   (poll 5s)
  TASK               ROLE          STATUS   AGE    LAST OUTPUT
  ----------------------------------------------------------------------------
  implementer-1      implementer   running  1m12s  Running ./gradlew test...
  code-reviewer-2    code-reviewer idle     0m40s  Waiting for a diff to review...

# ^C the board (the backgrounded supervisor keeps running); later:
$ scripts/fleet/pit-wall.sh attach implementer-1     # jump in and look around
$ scripts/fleet/pit-wall.sh status
implementer-1	implementer	done
code-reviewer-2	code-reviewer	running

$ scripts/fleet/pit-wall.sh teardown implementer-1   # done with just this one
pit-wall: torn down implementer-1

$ scripts/fleet/pit-wall.sh teardown --all           # or clear the whole fleet
pit-wall: torn down all tasks
```

## The opencode backend: fleet-`<role>` agents

An earlier revision of this page claimed the opencode backend ran "the same
binary and agent files the rest of this repo uses, just launched
standalone." That was wrong, and silently so: `opencode run --agent <name>`
(confirmed against opencode 1.17.18 on the authoring machine, via `opencode
run --help` / `opencode agent --help` and live testing — there is no flag
to force it) requires a **primary**-mode agent for a top-level CLI
invocation. Of the six roles, only `agents/tech-lead.md` is `mode: primary`
— the other five are `mode: subagent` by design (that's the enforcement
mechanism for in-session tech-lead → worker delegation; see the root
README's ["How orchestration is
enforced"](../README.md#how-orchestration-is-enforced), and it is
deliberately **not** changed for fleet mode's sake). Before this was fixed,
spawning any of those five under the opencode backend printed:

```
! agent "boilerplate" is a subagent, not a primary agent. Falling back to default agent
> build · big-pickle
```

...and silently ran the generic default agent instead — none of the
intended persona, permission restrictions, or model routing, with only that
one easy-to-miss warning line as a clue.

**The fix:** `agents/*.md` are never edited for this. Instead,
`node scripts/sync-fleet-agents.mjs` generates a `mode: primary` copy of
each role under `agents/fleet/fleet-<role>.md` — `fleet-tech-lead`,
`fleet-senior-dev`, `fleet-implementer`, `fleet-boilerplate`,
`fleet-code-reviewer`, `fleet-debugger` — and `scripts/fleet/lib/common.sh`'s
`fleet_build_launch_cmd` targets that name instead of the bare role name
for the `opencode` backend (the `antigravity` backend already targeted its
own distinct `oc-<role>` names and needed no change). Every field from the
source frontmatter is carried over **verbatim** except `mode` —
`permission.task: deny`, `permission.edit`, and every `bash` pattern map
are reproduced exactly, so a fleet-spawned worker keeps its existing
restrictions rather than a loosened copy of them — and the markdown body is
copied byte-for-byte, unmodified (unlike the Codex mirrors' small
`CODEX_REWRITES`: fleet mode runs the *same* worker prompt outside the
tech-lead hierarchy, not a rewritten one).

```text
agents/<role>.md ──sync-fleet-agents.mjs──> agents/fleet/fleet-<role>.md
```

Placed in a subdirectory (`agents/fleet/`), not as a file directly under
`agents/`, so the three existing platform generators — which each do a
flat, non-recursive `agents/*.md` read — never see them (a directory entry
doesn't end in `.md`, so their filter already skips it).

**Why the global agent directory, and why a distinct name are both
necessary** (both confirmed empirically, not assumed):

- OpenCode's custom-agent discovery was tested directly against a live
  `opencode` install (v1.17.18): a `mode: primary` `.md` file dropped
  either flat in `~/.config/opencode/agents/` (the directory
  `scripts/install.sh` already symlinks this repo's `agents/` into) *or* in
  a project-local `.opencode/agents/` directory (relative to the invoking
  `cwd`) is discovered and runs as itself — `opencode agent list` showed
  it, and `opencode run --agent <name>` loaded it with no fallback warning,
  the banner correctly reading `> <name> · <model>` instead of `> build ·
  <model>`. (One level of subdirectory nesting under the global directory
  also works, surfaced as `<subdir>/<name>` — not used here, since it's
  undocumented behavior and the flat `fleet-<role>` naming this repo
  recommends needs no subdirectory.) Project-local `.opencode/agents/`
  was *not* chosen as the deployment target even though it also works: a
  fleet task's tmux window `cwd` is wherever `pit-wall.sh spawn` was
  invoked from (see `scripts/fleet/pit-wall.sh`'s `cmd_spawn`, `cwd="$PWD"`)
  — any project, not necessarily this repo's own checkout — so only the
  global directory is a reliable discovery path for fleet mode's actual
  usage pattern. `scripts/install.sh`'s `opencode` step therefore
  additionally symlinks `agents/fleet/*.md` into
  `~/.config/opencode/agents/`, flat, alongside the six primary agents.
- OpenCode's `config/opencode.<profile>.jsonc` `agent.<name>.model`
  routing is keyed by the *exact* invoked agent identifier — confirmed by
  adding a temporary `agent["<scratch-name>"].model` entry to a live merged
  `~/.config/opencode/opencode.jsonc` and observing the run's model banner
  pick it up only when the identifier matched exactly, never falling back
  to a same-role entry under a different name. So `agent.fleet-<role>`
  does **not** inherit `agent.<role>`'s entry just because the two share a
  body, and both `config/opencode.personal.jsonc` and
  `config/opencode.work.jsonc` carry a `fleet-<role>` entry for all six
  roles, each a deliberate 1:1 mirror of its non-fleet counterpart (see
  docs/model-routing.md for the tier reasoning itself, which is unchanged).

**Regenerating and CI:**

```bash
node scripts/sync-fleet-agents.mjs --profile personal          # regenerate agents/fleet/*.md
node scripts/sync-fleet-agents.mjs --profile personal --check  # CI: nonzero exit if any file is stale
```

`scripts/install.sh`'s `opencode` step runs the regenerate command above
before symlinking, the same "regenerate before validating" pattern the
`claude`/`codex` steps use for their own generators. There is no separate
`--check` line for this in CI (`.github/workflows/ci.yml`): drift detection
is folded into `node scripts/validate.mjs --platform opencode` (which
`--platform all` already runs), the same precedent
`sync-antigravity-agents.mjs` set — see that script's own generated files
having no separate CI `--check` line either. `validate.mjs` rebuilds every
`agents/fleet/fleet-<role>.md` in-memory from its `agents/<role>.md` source
and compares byte-for-byte, and separately asserts every `agent.<role>` /
`agent.fleet-<role>` pair in both config profiles is present with a real
(non-`TODO`, for the personal profile) model.

## Statuses

Every task is in exactly one of five states, derived each poll from two tmux
signals — whether the launched process has exited, and whether the pane's
captured output has changed recently:

| Status | Meaning |
|---|---|
| `running` | The launched `opencode` process is alive and its pane output has changed within the last `SCUDERIA_FLEET_IDLE` seconds. |
| `idle` | No pane-output change for at least `SCUDERIA_FLEET_IDLE` seconds, but the last few lines don't look like a prompt. |
| `wedged` | Same as `idle`, but the last few lines look like the agent is waiting on you (a `?`, `(y/n)`, `password`, `continue`, `approve`, `[y/n]`, `permission`, …). |
| `done` | The launched process has exited (tmux's `pane_dead`, checked before anything else — completion is authoritative even over a wedged-looking last line). |
| `gone` | The tmux window itself disappeared (closed or killed outside of `teardown`). |

`done` and `gone` are sticky terminal states — once set, they're never
recomputed. The board (`view`) prints `wedged` upper-cased as `WEDGED` so it
stands out in the last-output column.

**The wedge alarm:** the moment a task's status flips from `running`/`idle`
into `wedged`, the supervisor rings a terminal bell (`\a`), logs an `ALARM:`
line, and — if `osascript` is available (macOS) — fires a
`display notification` titled "Scuderia pit wall". It only fires on that
edge, not on every poll while a task stays wedged, so it won't keep nagging
you for one unattended prompt.

## Configuration

All tunables are environment variables, read once when `pit-wall.sh` sources
`scripts/fleet/lib/common.sh`, each overridable by exporting it before you
run any `pit-wall.sh` command:

| Variable | Default | Meaning |
|---|---|---|
| `SCUDERIA_FLEET_HOME` | `${XDG_CACHE_HOME:-$HOME/.cache}/scuderia/fleet` | Run home: where all task/session state is kept. |
| `SCUDERIA_FLEET_SESSION` | `scuderia` | tmux session name used to host task windows when fleet mode isn't invoked from inside tmux already. |
| `SCUDERIA_FLEET_POLL` | `5` | Supervisor poll interval and `view --watch` redraw interval, in seconds. |
| `SCUDERIA_FLEET_IDLE` | `45` | Seconds with no pane-output change before a task is marked `idle` (and, if it looks stuck on a prompt, `wedged`). |
| `SCUDERIA_FLEET_OPENCODE` | `opencode` | The harness binary invoked to launch a role under the `opencode` backend — override to point at a wrapper or a non-`PATH` binary. |
| `SCUDERIA_FLEET_AGY` | `agy` | The harness binary invoked to launch a role under the `antigravity` backend. |
| `SCUDERIA_FLEET_BACKEND` | `opencode` | Default backend for `spawn` when `--backend` isn't given: `opencode` or `antigravity`. |
| `SCUDERIA_FLEET_CAPTURE_LINES` | `200` | How many lines of pane scrollback are captured per poll, both for the idle/wedged hash and for the board's last-output tail. |

Two more `SCUDERIA_FLEET_*` variables exist for advanced/test use, with no
default — they're only consulted if set:

- `SCUDERIA_FLEET_RUN_ARGS` — extra arguments spliced into the launch
  command, between `--agent <role>` and the brief.
- `SCUDERIA_FLEET_LAUNCH_CMD` — replaces the entire launch command `spawn`
  would otherwise build; used by the test suite to stub out `opencode`.

## Requirements and notes

- **Needs `tmux`.** `spawn` checks for it up front and dies with an
  install hint (`brew install tmux`) rather than failing deep inside a
  tmux call.
- **State lives outside the repo**, under `SCUDERIA_FLEET_HOME` (default
  `~/.cache/scuderia/fleet`) — a `tasks/` directory with two disposable
  files per task (`<id>.env` metadata, `<id>.brief` the raw brief text), a
  `fleet.log`, and the supervisor's pid file. `teardown --all` wipes it;
  nothing here is meant to survive a clean checkout or be committed.
- **Each task is a real `opencode run --agent <name> "<brief>"` invocation**
  (or `SCUDERIA_FLEET_LAUNCH_CMD` if you've overridden it) — the same
  `opencode` binary the rest of this repo uses, launched standalone instead
  of as a delegated subagent. For the `opencode` backend, `<name>` is
  `fleet-<role>`, not the bare role name — see the next section for why.
- **A task target is a tmux window id** (e.g. `@7`), captured once at
  creation, not a window name — so a harness relabelling its own window
  can never make the supervisor or `attach` target the wrong pane.
- The library scripts (`lib/common.sh`, `lib/supervise.sh`, `lib/tmux.sh`)
  are sourced by `pit-wall.sh` and are not meant to be run directly.
