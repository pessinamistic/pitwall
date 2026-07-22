#!/usr/bin/env bash
# scripts/fleet/fleet-smoke.test.sh -- self-contained smoke test for
# Scuderia fleet mode. Sources the three fleet libs and drives
# fleet_supervise_task through all five transitions (running -> idle ->
# wedged+alarm -> done -> gone) against a throwaway tmux session.
#
# Fleet mode is opt-in and needs tmux; if tmux isn't installed this test
# SKIPs (exit 0) rather than failing a tmux-less CI runner.
#
# Usage: bash scripts/fleet/fleet-smoke.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
FLEET_DIR="$SCRIPT_DIR"

if ! command -v tmux >/dev/null 2>&1; then
  echo "SKIP: tmux not installed"
  exit 0
fi

SCUDERIA_FLEET_HOME="$(mktemp -d "${TMPDIR:-/tmp}/scuderia-fleet-smoke.XXXXXX")"
export SCUDERIA_FLEET_HOME
export SCUDERIA_FLEET_SESSION="scuderia-smoke-$$"
export SCUDERIA_FLEET_IDLE=2
unset TMUX

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below, not called directly
cleanup() {
  tmux kill-session -t "$SCUDERIA_FLEET_SESSION" >/dev/null 2>&1 || true
  rm -rf "$SCUDERIA_FLEET_HOME"
}
trap cleanup EXIT

# shellcheck source=scripts/fleet/lib/common.sh
. "$FLEET_DIR/lib/common.sh"
# shellcheck source=scripts/fleet/lib/tmux.sh
. "$FLEET_DIR/lib/tmux.sh"
# shellcheck source=scripts/fleet/lib/supervise.sh
. "$FLEET_DIR/lib/supervise.sh"

fleet_init_home
tmux kill-session -t "$SCUDERIA_FLEET_SESSION" >/dev/null 2>&1 || true
ses="$(fleet_tmux_session_ensure)"

pass=0
fail=0
check() {
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1 -> $2"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 -> got '$2' want '$3'"
    fail=$((fail + 1))
  fi
}

# prompt text lives in a file so the launch command needs no nested quoting
printf 'Continue with this change? [y/N] ' > "$SCUDERIA_FLEET_HOME/prompt.txt"

# RUNNING then IDLE: a silent long-running pane
w1="$(fleet_tmux_create_window "$ses" pit-run "$PWD" 'sleep 40')"
fleet_set run role implementer; fleet_set run window "$w1"
fleet_set run created "$(fleet_now)"; fleet_set run change_at "$(fleet_now)"
fleet_set run status running; fleet_set run hash ""
sleep 1
check "fresh pane" "$(fleet_supervise_task run)" running
fleet_set run change_at "$(($(fleet_now) - 10))"
check "silent 10s" "$(fleet_supervise_task run)" idle

# WEDGED + ALARM: prompt in the pane tail, still running
w2="$(fleet_tmux_create_window "$ses" pit-wedge "$PWD" "sh -c 'cat $SCUDERIA_FLEET_HOME/prompt.txt; sleep 40'")"
fleet_set wedge role senior-dev; fleet_set wedge window "$w2"
fleet_set wedge created "$(fleet_now)"; fleet_set wedge change_at "$(fleet_now)"; fleet_set wedge status running; fleet_set wedge hash ""
sleep 1
fleet_supervise_task wedge >/dev/null           # prime: record current output hash
fleet_set wedge change_at "$(($(fleet_now) - 10))"   # backdate -> output now "stale" -> idle
check "prompt in tail" "$(fleet_supervise_task wedge)" wedged

# DONE: launched agent process exits (remain-on-exit keeps the pane)
w3="$(fleet_tmux_create_window "$ses" pit-done "$PWD" "sh -c 'sleep 1'")"
fleet_set fin role debugger; fleet_set fin window "$w3"
fleet_set fin created "$(fleet_now)"; fleet_set fin change_at "$(fleet_now)"
fleet_set fin status running; fleet_set fin hash ""
sleep 2
check "agent exited" "$(fleet_supervise_task fin)" "done"

# GONE: window killed out from under us
w4="$(fleet_tmux_create_window "$ses" pit-gone "$PWD" 'sleep 40')"
fleet_set van role boilerplate; fleet_set van window "$w4"; fleet_set van status running
fleet_tmux_kill "$w4"
sleep 1
check "window killed" "$(fleet_supervise_task van)" gone

echo ""
echo "  alarm logged? $(grep -c ALARM "$FLEET_LOG" 2>/dev/null || echo 0) line(s)"

# --- backend selection: pure launch-command construction, no tmux needed ---
SCUDERIA_FLEET_OPENCODE="opencode"
SCUDERIA_FLEET_AGY="agy"
unset SCUDERIA_FLEET_RUN_ARGS

check "opencode backend (default)" \
  "$(fleet_build_launch_cmd implementer opencode 'add the healthz endpoint')" \
  "opencode run --agent implementer  'add the healthz endpoint'"

check "antigravity backend" \
  "$(fleet_build_launch_cmd implementer antigravity 'add the healthz endpoint')" \
  "agy --agent oc-implementer --print 'add the healthz endpoint'"

fleet_build_launch_cmd implementer bogus-backend 'x' >/dev/null 2>&1
check "invalid backend fails" "$?" "1"

echo ""
echo "  RESULT: $pass passed, $fail failed"

if [ "$fail" -ne 0 ]; then
  exit 1
fi
exit 0
