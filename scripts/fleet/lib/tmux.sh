#!/usr/bin/env bash
# scripts/fleet/lib/tmux.sh -- the tmux session-provider for Scuderia fleet
# mode. Sourced by pit-wall.sh; never executed directly. Adapted from
# firstmate's reference tmux backend, trimmed to the primitives fleet mode
# needs: ensure a session, create a named window, send input, capture output,
# probe agent liveness, and kill a window.
#
# A "task target" is a stable tmux window id (e.g. @7). We pin window names
# and capture the window id at creation so name churn (a harness relabelling
# its window) can never make us target the wrong pane.

fleet_tmux_available() { command -v tmux >/dev/null 2>&1; }

# Ensure a session to host task windows: reuse the current session when
# fleet mode is invoked from inside tmux, else ensure a dedicated detached
# session. Prints the resolved session name.
fleet_tmux_session_ensure() {
  if [ -n "${TMUX:-}" ]; then
    tmux display-message -p '#S'
  else
    tmux has-session -t "$SCUDERIA_FLEET_SESSION" 2>/dev/null \
      || tmux new-session -d -s "$SCUDERIA_FLEET_SESSION"
    printf '%s' "$SCUDERIA_FLEET_SESSION"
  fi
}

# fleet_tmux_create_window <session> <window-name> <cwd> <command> -> window id.
# Runs <command> as the window's OWN process (via tmux's shell), so there is
# no send-keys race with an interactive shell's startup. remain-on-exit keeps
# the pane after the command finishes, so its final output stays readable and
# completion is detectable via #{pane_dead}. Refuses to clobber a same-named
# window and pins the name so the harness can't rename it out from under us.
fleet_tmux_create_window() {
  local ses="$1" wname="$2" cwd="$3" cmd="$4" wid
  if tmux list-windows -t "$ses" -F '#{window_name}' 2>/dev/null | grep -qx "$wname"; then
    echo "pit-wall: tmux window $ses:$wname already exists" >&2
    return 1
  fi
  wid="$(tmux new-window -dP -F '#{window_id}' -t "$ses:" -n "$wname" -c "$cwd" "$cmd")" || return 1
  tmux set-window-option -t "$wid" remain-on-exit on 2>/dev/null || true
  tmux set-window-option -t "$wid" automatic-rename off 2>/dev/null || true
  tmux set-window-option -t "$wid" allow-rename off 2>/dev/null || true
  printf '%s' "$wid"
}

# Send one line of text followed by Enter (used to talk to a live pane).
fleet_tmux_send_line() { tmux send-keys -t "$1" "$2" Enter; }

# Capture up to <lines> of plain-text scrollback from the target pane.
fleet_tmux_capture() { tmux capture-pane -p -t "$1" -S -"$2" 2>/dev/null; }

# The pane's live foreground command name (empty on any tmux error).
fleet_tmux_current_command() {
  tmux display-message -p -t "$1" '#{pane_current_command}' 2>/dev/null
}

# Does the target window still exist? Checked against the full window list
# (an explicit id match), because `display-message -t <gone>` silently falls
# back to the active window and would report a killed window as still alive.
fleet_tmux_window_exists() {
  tmux list-windows -a -F '#{window_id}' 2>/dev/null | grep -qx "$1"
}

# Has the launched command finished? With remain-on-exit on, tmux keeps the
# pane and flags #{pane_dead}=1 once its process exits. Prints 1 (done) or 0
# (still running); 0 on any read error so a task is never falsely called done.
fleet_tmux_pane_dead() {
  local d; d="$(tmux display-message -p -t "$1" '#{pane_dead}' 2>/dev/null)"
  printf '%s' "${d:-0}"
}

fleet_tmux_kill() { tmux kill-window -t "$1" 2>/dev/null || true; }
