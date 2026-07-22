# Fleet mode (optional)

An alternate, opt-in way to run the roster: instead of one `tech-lead`
session delegating in-session, each role runs as its own top-level
`opencode` process in its own tmux window, watched over by a supervisor that
renders a live "pit wall" board. Lives entirely in `scripts/fleet/`; needs
`tmux` installed and nothing else.

> [!WARNING]
> **Fleet mode bypasses the permission-enforced tech-lead → worker
> hierarchy.** Every pane it spawns is an independent, top-level agent
> running a role prompt (`opencode run --agent <role> "<brief>"`) — not a
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

- **`opencode`** (default) — `opencode run --agent <role> "<brief>"`, same as
  always.
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
- **Each task is a real `opencode run --agent <role> "<brief>"` invocation**
  (or `SCUDERIA_FLEET_LAUNCH_CMD` if you've overridden it) — the same
  binary and agent files the rest of this repo uses, just launched
  standalone instead of as a delegated subagent.
- **A task target is a tmux window id** (e.g. `@7`), captured once at
  creation, not a window name — so a harness relabelling its own window
  can never make the supervisor or `attach` target the wrong pane.
- The library scripts (`lib/common.sh`, `lib/supervise.sh`, `lib/tmux.sh`)
  are sourced by `pit-wall.sh` and are not meant to be run directly.
