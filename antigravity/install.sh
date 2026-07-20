#!/usr/bin/env bash
# Installs the OpenCode engineering team agents into Google Antigravity.
#
# Creates symlinks from ~/.gemini/skills/engineering-team/ and
# ~/.gemini/rules/engineering-team.md to the corresponding files in this
# repo, so the repo stays the single source of truth. It also mirrors every
# directory under .claude/skills/ (delegate-first, java, kafka, ...) into
# ~/.gemini/skills/<name>/, so any skill added there is picked up here too
# without a second script to maintain.
#
# Safe to re-run. Existing symlinks are refreshed; real directories are
# never overwritten.
#
# Usage:
#   antigravity/install.sh [--dry-run] [--uninstall]

set -euo pipefail
shopt -s nullglob

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

# Every directory under .claude/skills/ — the shared skill source for
# OpenCode and Claude Code (see docs/adding-a-skill.md) — gets mirrored
# into ~/.gemini/skills/<name>/ too. This is IN ADDITION to the hardcoded
# engineering-team skill above, which is Antigravity-specific and not
# sourced from .claude/skills/.
CLAUDE_SKILLS_SRC_DIR="$REPO_ROOT/.claude/skills"

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

  # Remove the generalized .claude/skills/* mirror symlinks too — only the
  # ones this script would have created (a real, non-symlink directory is
  # never touched).
  for skill_src in "$CLAUDE_SKILLS_SRC_DIR"/*/; do
    skill_name="$(basename "$skill_src")"
    skill_target="$SKILLS_DIR/$skill_name"
    if [ -L "$skill_target" ]; then
      act "remove symlink $skill_target" rm "$skill_target"
    elif [ -e "$skill_target" ]; then
      log "WARNING: $skill_target is not a symlink — skipping."
    else
      log "$skill_target does not exist — nothing to remove."
    fi
  done

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

# 4. Mirror every directory under .claude/skills/ into ~/.gemini/skills/,
#    one at a time, so an existing non-symlink skill directory there is
#    never touched (same warn-and-skip behavior as scripts/install.sh's
#    equivalent .claude/skills loop for ~/.claude/skills/).
INSTALLED_GENERIC_SKILLS=()
for skill_src in "$CLAUDE_SKILLS_SRC_DIR"/*/; do
  skill_name="$(basename "$skill_src")"
  skill_target="$SKILLS_DIR/$skill_name"
  skill_src="${skill_src%/}"

  if [ -L "$skill_target" ]; then
    act "refresh existing symlink $skill_target -> $skill_src" bash -c \
      'rm "$1" && ln -s "$2" "$1"' _ "$skill_target" "$skill_src"
    INSTALLED_GENERIC_SKILLS+=("$skill_name")
  elif [ -e "$skill_target" ]; then
    log "WARNING: $skill_target already exists and is not a symlink — skipping (not overwriting a real directory)."
  else
    act "symlink $skill_target -> $skill_src" ln -s "$skill_src" "$skill_target"
    INSTALLED_GENERIC_SKILLS+=("$skill_name")
  fi
done

log ""
log "antigravity/install.sh: done (dry-run=$DRY_RUN)."
log ""
log "Installed:"
log "  skill:  $SKILL_TARGET -> $SKILL_SRC"
log "  rules:  $RULES_TARGET -> $RULES_SRC"
if [ "${#INSTALLED_GENERIC_SKILLS[@]}" -gt 0 ]; then
  log "  skills mirrored from .claude/skills/ into $SKILLS_DIR/:"
  for skill_name in "${INSTALLED_GENERIC_SKILLS[@]}"; do
    log "    - $skill_name"
  done
else
  log "  skills mirrored from .claude/skills/ into $SKILLS_DIR/: none found"
fi
log ""
log "Restart Antigravity (agy) for the agents to be available."
