#!/usr/bin/env bash
# Installs the OpenCode engineering team agents into Google Antigravity.
#
# Creates symlinks from ~/.gemini/skills/engineering-team/ and
# ~/.gemini/rules/engineering-team.md to the corresponding files in this
# repo, so the repo stays the single source of truth.
#
# Safe to re-run. Existing symlinks are refreshed; real directories are
# never overwritten.
#
# Usage:
#   antigravity/install.sh [--dry-run] [--uninstall]

set -euo pipefail

DRY_RUN=0
UNINSTALL=0

usage() {
  cat <<'USAGE'
Usage: antigravity/install.sh [--dry-run] [--uninstall]

  --dry-run     Print every action; do nothing.
  --uninstall   Remove the symlinks (does not touch the repo).
  -h, --help    Show this help.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)   DRY_RUN=1;   shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help)   usage; exit 0 ;;
    *)
      echo "antigravity/install.sh: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

GEMINI_DIR="$HOME/.gemini"
SKILLS_DIR="$GEMINI_DIR/skills"
RULES_DIR="$GEMINI_DIR/rules"

SKILL_SRC="$REPO_ROOT/antigravity/skill"
RULES_SRC="$REPO_ROOT/antigravity/rules/engineering-team.md"

SKILL_TARGET="$SKILLS_DIR/engineering-team"
RULES_TARGET="$RULES_DIR/engineering-team.md"

log() { printf '%s\n' "$*"; }

act() {
  local desc="$1"; shift
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: $desc"
  else
    log "-> $desc"
    "$@"
  fi
}

# ---- Uninstall mode ----
if [ "$UNINSTALL" = "1" ]; then
  if [ -L "$SKILL_TARGET" ]; then
    act "remove symlink $SKILL_TARGET" rm "$SKILL_TARGET"
  elif [ -e "$SKILL_TARGET" ]; then
    log "WARNING: $SKILL_TARGET is not a symlink — skipping."
  else
    log "$SKILL_TARGET does not exist — nothing to remove."
  fi

  if [ -L "$RULES_TARGET" ]; then
    act "remove symlink $RULES_TARGET" rm "$RULES_TARGET"
  elif [ -e "$RULES_TARGET" ]; then
    log "WARNING: $RULES_TARGET is not a symlink — skipping."
  else
    log "$RULES_TARGET does not exist — nothing to remove."
  fi

  log ""
  log "antigravity/install.sh: uninstall done (dry-run=$DRY_RUN)."
  exit 0
fi

# ---- Install mode ----

# 1. Ensure target directories exist
act "ensure $SKILLS_DIR exists" mkdir -p "$SKILLS_DIR"
act "ensure $RULES_DIR exists"  mkdir -p "$RULES_DIR"

# 2. Symlink the skill directory
if [ -L "$SKILL_TARGET" ]; then
  act "refresh symlink $SKILL_TARGET -> $SKILL_SRC" bash -c \
    'rm "$1" && ln -s "$2" "$1"' _ "$SKILL_TARGET" "$SKILL_SRC"
elif [ -e "$SKILL_TARGET" ]; then
  log "WARNING: $SKILL_TARGET exists and is not a symlink — backing up."
  act "backup $SKILL_TARGET" mv "$SKILL_TARGET" "$SKILL_TARGET.bak.$TIMESTAMP"
  act "symlink $SKILL_TARGET -> $SKILL_SRC" ln -s "$SKILL_SRC" "$SKILL_TARGET"
else
  act "symlink $SKILL_TARGET -> $SKILL_SRC" ln -s "$SKILL_SRC" "$SKILL_TARGET"
fi

# 3. Symlink the rules file
if [ -L "$RULES_TARGET" ]; then
  act "refresh symlink $RULES_TARGET -> $RULES_SRC" bash -c \
    'rm "$1" && ln -s "$2" "$1"' _ "$RULES_TARGET" "$RULES_SRC"
elif [ -e "$RULES_TARGET" ]; then
  log "WARNING: $RULES_TARGET exists and is not a symlink — backing up."
  act "backup $RULES_TARGET" mv "$RULES_TARGET" "$RULES_TARGET.bak.$TIMESTAMP"
  act "symlink $RULES_TARGET -> $RULES_SRC" ln -s "$RULES_SRC" "$RULES_TARGET"
else
  act "symlink $RULES_TARGET -> $RULES_SRC" ln -s "$RULES_SRC" "$RULES_TARGET"
fi

log ""
log "antigravity/install.sh: done (dry-run=$DRY_RUN)."
log ""
log "Installed:"
log "  skill:  $SKILL_TARGET -> $SKILL_SRC"
log "  rules:  $RULES_TARGET -> $RULES_SRC"
log ""
log "Restart Antigravity (agy) for the agents to be available."
