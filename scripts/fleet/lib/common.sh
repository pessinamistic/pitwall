#!/usr/bin/env bash
# scripts/fleet/lib/common.sh -- shared config, paths, and task-state helpers
# for Scuderia fleet mode. Sourced by pit-wall.sh and the supervisor; never
# executed directly. Kept bash 3.2 compatible (no associative arrays, no
# mapfile) so it runs on a stock macOS /bin/bash.
#
# State model: one run home ($SCUDERIA_FLEET_HOME), a tasks/ dir with two
# files per task -- <id>.env (single-line KEY=VALUE metadata) and <id>.brief
# (the raw brief, may be multi-line). Everything lives outside the repo and
# is disposable.

# --- tunables (all overridable from the environment) ---
: "${SCUDERIA_FLEET_HOME:=${XDG_CACHE_HOME:-$HOME/.cache}/scuderia/fleet}"
: "${SCUDERIA_FLEET_SESSION:=scuderia}"       # tmux session used when not already inside tmux
: "${SCUDERIA_FLEET_POLL:=5}"                 # supervisor poll interval, seconds
: "${SCUDERIA_FLEET_IDLE:=45}"                # seconds with no pane-output change -> idle
: "${SCUDERIA_FLEET_OPENCODE:=opencode}"      # harness binary used to launch a role (opencode backend)
: "${SCUDERIA_FLEET_AGY:=agy}"                # harness binary used to launch a role (antigravity backend)
: "${SCUDERIA_FLEET_BACKEND:=opencode}"       # default spawn backend: opencode | antigravity
: "${SCUDERIA_FLEET_CAPTURE_LINES:=200}"      # pane lines captured for hashing / tail

FLEET_TASKS_DIR="$SCUDERIA_FLEET_HOME/tasks"
FLEET_LOG="$SCUDERIA_FLEET_HOME/fleet.log"
# Consumed by the supervisor loop and teardown in the sibling fleet scripts.
# shellcheck disable=SC2034
FLEET_DAEMON_PID="$SCUDERIA_FLEET_HOME/daemon.pid"

# The six Scuderia roles (functional ids), space-delimited for a POSIX
# membership test without arrays.
FLEET_ROLES="tech-lead senior-dev implementer boilerplate code-reviewer debugger"

fleet_now() { date +%s; }
fleet_ts()  { date +%Y%m%d-%H%M%S; }

fleet_log() {
  mkdir -p "$SCUDERIA_FLEET_HOME"
  printf '%s %s\n' "$(fleet_ts)" "$*" >> "$FLEET_LOG"
}

fleet_die() { printf 'pit-wall: %s\n' "$*" >&2; exit 1; }

# Single-quote a string for safe reuse inside a shell command line.
fleet_shq() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }

fleet_init_home() { mkdir -p "$FLEET_TASKS_DIR"; }

fleet_is_role() {
  case " $FLEET_ROLES " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

fleet_task_file()  { printf '%s/%s.env'   "$FLEET_TASKS_DIR" "$1"; }
fleet_brief_file() { printf '%s/%s.brief' "$FLEET_TASKS_DIR" "$1"; }

# fleet_set <id> <key> <value> -- upsert a single-line key in the task's .env.
# Keys are fixed identifiers and values are single-line, so the plain grep
# filter is safe (no user-controlled regex reaches the pattern).
fleet_set() {
  local id="$1" key="$2" val="$3" f tmp
  f="$(fleet_task_file "$id")"
  tmp="$f.tmp.$$"
  if [ -f "$f" ]; then grep -v "^$key=" "$f" > "$tmp" 2>/dev/null || true; else : > "$tmp"; fi
  printf '%s=%s\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$f"
}

# fleet_get <id> <key> -- echo the value, or return 1 if unset.
fleet_get() {
  local id="$1" key="$2" f line
  f="$(fleet_task_file "$id")"
  [ -f "$f" ] || return 1
  line="$(grep "^$key=" "$f" | tail -1)" || return 1
  [ -n "$line" ] || return 1
  printf '%s' "${line#*=}"
}

# fleet_task_ids -- print every known task id, one per line (oldest first).
fleet_task_ids() {
  local f id
  for f in "$FLEET_TASKS_DIR"/*.env; do
    [ -e "$f" ] || continue          # guard instead of relying on nullglob
    id="$(basename "$f")"
    printf '%s\n' "${id%.env}"
  done
}

fleet_task_count() { fleet_task_ids | grep -c . || true; }

# fleet_build_launch_cmd <role> <backend> <brief> -- builds the shell command
# string used to launch a role under the given backend. Pure function, no
# side effects and no tmux dependency, so it's unit-testable on its own
# (see fleet-smoke.test.sh) without spawning a real window. Does NOT
# consult SCUDERIA_FLEET_LAUNCH_CMD -- that full-override escape hatch is
# checked by the caller (pit-wall.sh's cmd_spawn) before this is ever
# invoked, and always wins over both backends below.
fleet_build_launch_cmd() {
  local role="$1" backend="$2" brief="$3"
  case "$backend" in
    opencode)
      printf '%s run --agent %s %s %s' \
        "$SCUDERIA_FLEET_OPENCODE" "$role" "${SCUDERIA_FLEET_RUN_ARGS:-}" "$(fleet_shq "$brief")"
      ;;
    antigravity)
      # Targets the oc-<role> custom agent installed by antigravity/install.sh
      # (see antigravity/README.md) -- not the bare role name, which agy
      # doesn't know about. --print runs one prompt non-interactively and
      # exits; the prompt is a plain trailing argument (confirmed empirically
      # against a live agy binary -- no special quoting or stdin needed).
      printf '%s --agent oc-%s --print %s' \
        "$SCUDERIA_FLEET_AGY" "$role" "$(fleet_shq "$brief")"
      ;;
    *)
      return 1
      ;;
  esac
}
