#!/usr/bin/env bash
# scripts/fleet/pit-wall.sh -- Scuderia fleet-mode CLI (optional tmux
# orchestration). Spawns each role as its own `opencode` process in a tmux
# window and supervises the fleet from the pit wall. Opt-in; needs tmux.
# See docs/fleet-mode.md for the model and its trade-offs.
#
# Usage:
#   pit-wall.sh spawn <role> ["--backend opencode|antigravity"] "<brief>"
#                                           launch a role in its own window
#   pit-wall.sh view [--watch]             the live board
#   pit-wall.sh supervise [--forever]      run the watcher loop (foreground)
#   pit-wall.sh watch [--forever]          supervise in the background, then view --watch
#   pit-wall.sh attach <task-id>           jump to a task's tmux window
#   pit-wall.sh status                     one-line-per-task machine view
#   pit-wall.sh teardown [<task-id>|--all] kill window(s) and clear state
set -euo pipefail

FLEET_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=scripts/fleet/lib/common.sh
. "$FLEET_DIR/lib/common.sh"
# shellcheck source=scripts/fleet/lib/tmux.sh
. "$FLEET_DIR/lib/tmux.sh"

usage() { sed -n '2,17p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

_age() {
  local secs now; now="$(fleet_now)"; secs=$(( now - ${1:-$now} ))
  if   [ "$secs" -lt 60 ];   then printf '%ds' "$secs"
  elif [ "$secs" -lt 3600 ]; then printf '%dm' $(( secs / 60 ))
  else printf '%dh%dm' $(( secs / 3600 )) $(( (secs % 3600) / 60 )); fi
}

_last_line() {
  local wid="$1" line=""
  [ -n "$wid" ] || { printf '—'; return 0; }
  line="$(fleet_tmux_capture "$wid" 40 | grep -v '^[[:space:]]*$' | tail -1)"
  [ -n "$line" ] || { printf '—'; return 0; }
  # trim to keep the row on one terminal line
  printf '%.52s' "$line"
}

_mark() {
  case "$1" in
    running) printf 'running' ;;
    idle)    printf 'idle'    ;;
    wedged)  printf 'WEDGED'  ;;
    done)    printf 'done'    ;;
    gone)    printf 'gone'    ;;
    *)       printf '%s' "$1" ;;
  esac
}

_render_board() {
  local id role status created wid n=0
  printf '\n  SCUDERIA — PIT WALL        %s   (poll %ss)\n' "$(fleet_ts)" "$SCUDERIA_FLEET_POLL"
  printf '  %-18s %-13s %-8s %-6s %s\n' TASK ROLE STATUS AGE 'LAST OUTPUT'
  printf '  %s\n' '----------------------------------------------------------------------------'
  for id in $(fleet_task_ids); do
    n=$((n+1))
    role="$(fleet_get "$id" role || echo '?')"
    status="$(fleet_get "$id" status || echo '?')"
    created="$(fleet_get "$id" created || fleet_now)"
    wid="$(fleet_get "$id" window || echo '')"
    printf '  %-18s %-13s %-8s %-6s %s\n' \
      "$id" "$role" "$(_mark "$status")" "$(_age "$created")" "$(_last_line "$wid")"
  done
  [ "$n" = "0" ] && printf '  (no tasks — pit-wall spawn <role> "<brief>")\n'
  printf '\n'
}

cmd_spawn() {
  local role="${1:-}"; shift 2>/dev/null || true
  [ -n "$role" ] || fleet_die "spawn: need a role (one of: $FLEET_ROLES)"
  fleet_is_role "$role" || fleet_die "unknown role '$role' (one of: $FLEET_ROLES)"

  # Pull an optional --backend <value> (or --backend=<value>) out of the
  # remaining args, wherever it appears; everything else joins the brief.
  local backend="${SCUDERIA_FLEET_BACKEND:-opencode}"
  local brief_args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --backend)   backend="${2:-}"; shift 2 ;;
      --backend=*) backend="${1#--backend=}"; shift ;;
      *)           brief_args+=("$1"); shift ;;
    esac
  done
  case "$backend" in
    opencode|antigravity) ;;
    *) fleet_die "spawn: --backend must be 'opencode' or 'antigravity', got '$backend'" ;;
  esac

  [ "${#brief_args[@]}" -gt 0 ] || fleet_die "spawn: need a brief, e.g. pit-wall spawn $role \"add the health endpoint\""
  fleet_tmux_available || fleet_die "tmux is not installed — fleet mode needs it (brew install tmux)"
  fleet_init_home

  local brief ses id wname wid cwd launch n
  brief="${brief_args[*]}"
  ses="$(fleet_tmux_session_ensure)"
  n="$(cat "$SCUDERIA_FLEET_HOME/.counter" 2>/dev/null || echo 0)"; n=$(( n + 1 ))
  printf '%s' "$n" > "$SCUDERIA_FLEET_HOME/.counter"
  id="$role-$n"
  wname="pit-$id"
  cwd="$PWD"

  if [ -n "${SCUDERIA_FLEET_LAUNCH_CMD:-}" ]; then
    launch="$SCUDERIA_FLEET_LAUNCH_CMD"            # test / advanced override
  else
    launch="$(fleet_build_launch_cmd "$role" "$backend" "$brief")"
  fi

  wid="$(fleet_tmux_create_window "$ses" "$wname" "$cwd" "$launch")" \
    || fleet_die "could not create tmux window (a task named $wname may already be running)"

  printf '%s' "$brief" > "$(fleet_brief_file "$id")"
  fleet_set "$id" role "$role"
  fleet_set "$id" backend "$backend"
  fleet_set "$id" window "$wid"
  fleet_set "$id" session "$ses"
  fleet_set "$id" cwd "$cwd"
  fleet_set "$id" launch "$launch"
  fleet_set "$id" created "$(fleet_now)"
  fleet_set "$id" change_at "$(fleet_now)"
  fleet_set "$id" status running
  fleet_set "$id" hash ""
  fleet_log "spawn $id role=$role window=$wid cwd=$cwd"

  printf 'pit-wall: spawned %s  (role=%s, backend=%s, window=%s)\n' "$id" "$role" "$backend" "$wid"
  printf '  view:   %s view --watch\n' "$0"
  printf '  attach: %s attach %s\n' "$0" "$id"
}

cmd_view() {
  fleet_init_home
  if [ "${1:-}" = "--watch" ]; then
    while :; do clear 2>/dev/null || true; _render_board; sleep "$SCUDERIA_FLEET_POLL"; done
  else
    _render_board
  fi
}

cmd_status() {
  fleet_init_home
  local id
  for id in $(fleet_task_ids); do
    printf '%s\t%s\t%s\n' "$id" "$(fleet_get "$id" role || echo '?')" "$(fleet_get "$id" status || echo '?')"
  done
}

cmd_supervise() {
  # shellcheck source=scripts/fleet/lib/supervise.sh
  . "$FLEET_DIR/lib/supervise.sh"
  local forever=0
  [ "${1:-}" = "--forever" ] && forever=1
  fleet_supervise_loop "$forever"
}

cmd_watch() {
  # background the supervisor, then show the live board in the foreground
  "$0" supervise "${1:-}" >/dev/null 2>&1 &
  fleet_log "watch: supervisor backgrounded as pid $!"
  cmd_view --watch
}

cmd_attach() {
  local id="${1:-}" wid ses
  [ -n "$id" ] || fleet_die "attach: need a task id (see: pit-wall status)"
  wid="$(fleet_get "$id" window)" || fleet_die "no such task: $id"
  ses="$(fleet_get "$id" session || echo "$SCUDERIA_FLEET_SESSION")"
  if [ -n "${TMUX:-}" ]; then
    tmux select-window -t "$wid"
  else
    tmux attach-session -t "$ses" \; select-window -t "$wid"
  fi
}

cmd_teardown() {
  local arg="${1:-}" id
  if [ -n "$arg" ] && [ "$arg" != "--all" ]; then
    fleet_tmux_kill "$(fleet_get "$arg" window || echo '')"
    rm -f "$(fleet_task_file "$arg")" "$(fleet_brief_file "$arg")"
    fleet_log "teardown $arg"
    printf 'pit-wall: torn down %s\n' "$arg"
    return 0
  fi
  for id in $(fleet_task_ids); do
    fleet_tmux_kill "$(fleet_get "$id" window || echo '')"
  done
  [ -f "$FLEET_DAEMON_PID" ] && kill "$(cat "$FLEET_DAEMON_PID")" 2>/dev/null || true
  rm -rf "$FLEET_TASKS_DIR"; mkdir -p "$FLEET_TASKS_DIR"
  rm -f "$FLEET_DAEMON_PID"
  fleet_log "teardown --all"
  printf 'pit-wall: torn down all tasks\n'
}

main() {
  local cmd="${1:-}"; shift 2>/dev/null || true
  case "$cmd" in
    spawn)      cmd_spawn "$@" ;;
    view)       cmd_view "$@" ;;
    watch)      cmd_watch "$@" ;;
    supervise)  cmd_supervise "$@" ;;
    status)     cmd_status "$@" ;;
    attach)     cmd_attach "$@" ;;
    teardown)   cmd_teardown "$@" ;;
    ''|-h|--help|help) usage ;;
    *) printf 'pit-wall: unknown command: %s\n\n' "$cmd" >&2; usage >&2; exit 1 ;;
  esac
}

main "$@"
