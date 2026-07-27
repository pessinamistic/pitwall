#!/usr/bin/env bash
# scripts/fleet/lib/supervise.sh -- the fleet supervisor loop. Sourced by
# pit-wall.sh (`pit-wall supervise`); never executed directly.
#
# Every SCUDERIA_FLEET_POLL seconds it walks each task and derives a status
# from two tmux signals:
#   * liveness  -- fleet_tmux_agent_alive (harness running vs bare shell)
#   * progress  -- a hash of the pane's captured scrollback; unchanged for
#                  longer than SCUDERIA_FLEET_IDLE seconds means no output.
# Status transitions: running -> idle -> wedged (idle AND the pane looks like
# it is waiting on a prompt), or running -> done (the harness process exited),
# or -> gone (the window disappeared). A newly wedged task rings the alarm.

# One task's status is recomputed and written back. Echoes the new status.
fleet_supervise_task() {
  local id="$1" wid prev now change_at hash newhash cap status idle_for
  wid="$(fleet_get "$id" window)" || return 0
  prev="$(fleet_get "$id" status || echo running)"

  # terminal states are sticky
  case "$prev" in done|gone) printf '%s' "$prev"; return 0 ;; esac

  if ! fleet_tmux_window_exists "$wid"; then
    fleet_set "$id" status gone
    fleet_log "task $id -> gone (window vanished)"
    printf 'gone'; return 0
  fi

  # completion is authoritative: the launched agent's process has exited
  if [ "$(fleet_tmux_pane_dead "$wid")" = "1" ]; then
    fleet_set "$id" status "done"
    fleet_set "$id" done_at "$(fleet_now)"
    fleet_log "task $id -> done (agent exited)"
    printf 'done'; return 0
  fi

  now="$(fleet_now)"
  cap="$(fleet_tmux_capture "$wid" "$SCUDERIA_FLEET_CAPTURE_LINES")"
  newhash="$(printf '%s' "$cap" | cksum | awk '{print $1}')"
  hash="$(fleet_get "$id" hash || echo '')"
  change_at="$(fleet_get "$id" change_at || echo "$now")"

  if [ "$newhash" != "$hash" ]; then
    fleet_set "$id" hash "$newhash"
    fleet_set "$id" change_at "$now"
    change_at="$now"
  fi
  idle_for=$(( now - change_at ))

  # still running: decide running / idle / wedged by output progress
  if [ "$idle_for" -ge "$SCUDERIA_FLEET_IDLE" ]; then
    if printf '%s' "$cap" | tail -3 | grep -qiE '\?|\(y/n\)|password|continue|approve|\[y/n\]|permission'; then
      status=wedged
    else
      status=idle
    fi
  else
    status=running
  fi

  # ring the alarm only on the running/idle -> wedged edge
  if [ "$status" = "wedged" ] && [ "$prev" != "wedged" ]; then
    fleet_alarm "$id" "$(fleet_get "$id" role || echo '?')"
  fi
  fleet_set "$id" status "$status"
  printf '%s' "$status"
}

# Terminal bell + log line + best-effort macOS notification.
fleet_alarm() {
  local id="$1" role="$2"
  printf '\a' >&2
  fleet_log "ALARM: task $id ($role) is WEDGED — needs your attention"
  if command -v osascript >/dev/null 2>&1; then
    osascript -e "display notification \"$id ($role) is wedged\" with title \"Scuderia pit wall\"" >/dev/null 2>&1 || true
  fi
}

# The daemon loop. Exits once every task is in a terminal state (done/gone),
# or runs forever if --forever was passed and tasks keep coming.
fleet_supervise_loop() {
  local forever="${1:-0}" id st active
  fleet_init_home
  printf '%s' "$$" > "$FLEET_DAEMON_PID"
  fleet_log "supervisor up (pid $$, poll ${SCUDERIA_FLEET_POLL}s, idle ${SCUDERIA_FLEET_IDLE}s)"
  trap 'rm -f "$FLEET_DAEMON_PID"; fleet_log "supervisor down"; exit 0' INT TERM
  while :; do
    active=0
    for id in $(fleet_task_ids); do
      st="$(fleet_supervise_task "$id")"
      case "$st" in done|gone) ;; *) active=$((active+1)) ;; esac
    done
    if [ "$active" = "0" ] && [ "$forever" != "1" ]; then
      fleet_log "supervisor idle — all tasks terminal, exiting"
      break
    fi
    sleep "$SCUDERIA_FLEET_POLL"
  done
  rm -f "$FLEET_DAEMON_PID"
}
