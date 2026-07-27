#!/usr/bin/env bash
# Advisory preflight/health detector for this repo's install. Prints exactly
# one "MISSING: <thing> (install: <cmd>)" line per problem found, prints
# nothing when everything is clean, and ALWAYS exits 0 — this is a detector,
# not an enforcing gate. Several checked tools are optional depending on
# platform (e.g. codex), so a nonzero exit here would wrongly imply a hard
# failure. Run it any time: `bash scripts/doctor.sh`.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------
# 1. Node >= 20.
# ---------------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  echo "MISSING: node>=20 (install: https://nodejs.org or your package manager)"
else
  node_version="$(node -v 2>/dev/null || true)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  if ! [[ "$node_major" =~ ^[0-9]+$ ]] || [ "$node_major" -lt 20 ]; then
    echo "MISSING: node>=20 (install: https://nodejs.org or your package manager)"
  fi
fi

# ---------------------------------------------------------------------
# 2. opencode on PATH.
# ---------------------------------------------------------------------

if ! command -v opencode >/dev/null 2>&1; then
  echo "MISSING: opencode (install: curl -fsSL https://opencode.ai/install | bash)"
fi

# ---------------------------------------------------------------------
# 3. ~/.claude directory exists.
# ---------------------------------------------------------------------

if [ ! -d "$HOME/.claude" ]; then
  echo "MISSING: ~/.claude (install: install Claude Code — https://claude.com/claude-code)"
fi

# ---------------------------------------------------------------------
# 4. codex CLI on PATH.
# ---------------------------------------------------------------------

if ! command -v codex >/dev/null 2>&1; then
  echo "MISSING: codex (install: npm install -g @openai/codex)"
fi

# ---------------------------------------------------------------------
# 5. Live install symlinks resolve under this repo.
# ---------------------------------------------------------------------

check_repo_symlink() {
  # check_repo_symlink <path> <label>
  local path="$1" label="$2" resolved
  if [ -L "$path" ]; then
    resolved="$(readlink "$path" 2>/dev/null || true)"
    case "$resolved" in
      "$REPO_ROOT"/*|"$REPO_ROOT")
        ;;
      *)
        echo "MISSING: $label (install: run scripts/install.sh)"
        ;;
    esac
  elif [ -e "$path" ]; then
    # A real (non-symlink) directory here is intentionally left alone by
    # the installer (e.g. a hand-authored skill) — not flagged.
    :
  else
    echo "MISSING: $label (install: run scripts/install.sh)"
  fi
}

# Second arg to check_repo_symlink is a decorative label only, not a path operand.
# shellcheck disable=SC2088
check_repo_symlink "$HOME/.config/opencode/agents" "~/.config/opencode/agents"
# shellcheck disable=SC2088
check_repo_symlink "$HOME/.claude/agents" "~/.claude/agents"

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
REPO_SKILLS_DIR="$REPO_ROOT/.claude/skills"
if [ -d "$REPO_SKILLS_DIR" ]; then
  for skill_src in "$REPO_SKILLS_DIR"/*/; do
    [ -d "$skill_src" ] || continue
    skill_name="$(basename "$skill_src")"
    # Second arg to check_repo_symlink is a decorative label only, not a path operand.
    # shellcheck disable=SC2088
    check_repo_symlink "$CLAUDE_SKILLS_DIR/$skill_name" "~/.claude/skills/$skill_name"
  done
fi

# ---------------------------------------------------------------------
# 6. tmux — only relevant if the user opted into fleet mode. If the pit-wall
#    CLI is installed (its symlink exists) but tmux is gone, fleet mode is
#    broken and worth flagging. Not checked otherwise: fleet mode is optional
#    and most installs never touch it.
# ---------------------------------------------------------------------

if [ -L "$HOME/.local/bin/pit-wall" ] && ! command -v tmux >/dev/null 2>&1; then
  echo "MISSING: tmux (needed for fleet mode; install: brew install tmux)"
fi

exit 0
