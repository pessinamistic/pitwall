#!/usr/bin/env bash
# Installs this repo's OpenCode agents + shared skills into
# ~/.config/opencode/ and ~/.claude/, and merges the chosen model-routing
# profile into ~/.config/opencode/opencode.jsonc. See README.md.
# Symlinks, never copies, so the repo stays the single source of
# truth. Safe to re-run.
#
# Usage:
#   scripts/install.sh [--target default|codex|all] [--profile personal|work] [--dry-run]
#
# Targets:
#   default (or omitted)  the existing OpenCode + Claude Code install path
#   codex                 generate .codex/agents/*.toml in the REPO only —
#                         never touches ~/.codex/config.toml or ~/.codex/agents
#   all                   default path, then the codex generation step
#
# With no --profile, the profile is auto-detected from `opencode models`
# and the choice (and reason) is printed before anything happens. With no
# --target, the target is auto-detected too: "all" (adds codex generation)
# if the codex CLI is on PATH, otherwise "default". When stdin is a TTY and
# --dry-run was not given, any auto-detected (not explicitly flagged) value
# is offered back for interactive confirmation/override.

set -euo pipefail
shopt -s nullglob

PROFILE=""
DRY_RUN=0
TARGET=""
TARGET_EXPLICIT=0

usage() {
  cat <<'USAGE'
Usage: install.sh [--target default|codex|all] [--profile personal|work] [--dry-run]

  --target default|codex|all  What to install. "default" (also when omitted)
                              is the OpenCode + Claude Code path; "codex"
                              only generates .codex/agents/*.toml inside the
                              repo; "all" does both.
  --profile personal|work     Force a routing profile instead of auto-detecting.
  --dry-run                   Print every action that would be taken; do nothing.
  -h, --help                  Show this help.
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      TARGET_EXPLICIT=1
      shift 2
      ;;
    --target=*)
      TARGET="${1#--target=}"
      TARGET_EXPLICIT=1
      shift
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --profile=*)
      PROFILE="${1#--profile=}"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install.sh: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -n "$PROFILE" ] && [ "$PROFILE" != "personal" ] && [ "$PROFILE" != "work" ]; then
  echo "install.sh: --profile must be \"personal\" or \"work\", got \"$PROFILE\"." >&2
  exit 1
fi
if [ -n "$TARGET" ] && [ "$TARGET" != "default" ] && [ "$TARGET" != "codex" ] && [ "$TARGET" != "all" ]; then
  echo "install.sh: --target must be \"default\", \"codex\", or \"all\", got \"$TARGET\"." >&2
  exit 1
fi

# Captured before auto-detection overwrites PROFILE, so the interactive
# prompt below only offers a confirmation for values that were *detected*,
# never for one the user already pinned down with a flag.
PROFILE_EXPLICIT=0
[ -n "$PROFILE" ] && PROFILE_EXPLICIT=1

# Prompt to confirm/override an auto-detected value, but only when stdin is
# a TTY and --dry-run was not given — never for a non-interactive/CI run,
# and never for a value the user already pinned with an explicit flag.
prompt_confirm() {
  # prompt_confirm <label> <detected-value> <valid-values-space-separated>
  local label="$1" detected="$2" valid="$3" input=""
  [ -t 0 ] || { printf '%s' "$detected"; return 0; }
  [ "$DRY_RUN" = "1" ] && { printf '%s' "$detected"; return 0; }
  read -r -p "$label [$valid] (Enter to accept \"$detected\"): " input || input=""
  if [ -z "$input" ]; then
    printf '%s' "$detected"
    return 0
  fi
  local v
  for v in $valid; do
    if [ "$input" = "$v" ]; then
      printf '%s' "$input"
      return 0
    fi
  done
  echo "install.sh: expected one of \"$valid\", got \"$input\"." >&2
  exit 1
}

# Repo location is derived from this script's own path — never hardcoded —
# so the script works regardless of where the repo is checked out or who
# is running it.
SCRIPT_SOURCE="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_SOURCE")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
TIMESTAMP="$(date +%Y%m%d%H%M%S)"

log() { printf '%s\n' "$*"; }

act() {
  # act "<description>" -- <command...>
  local desc="$1"
  shift
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: $desc"
  else
    log "-> $desc"
    "$@"
  fi
}

# ---------------------------------------------------------------------
# 0. Determine the target.
# ---------------------------------------------------------------------

if [ "$TARGET_EXPLICIT" = "1" ]; then
  TARGET_REASON="explicitly requested via --target $TARGET"
else
  if command -v codex >/dev/null 2>&1; then
    DETECTED_TARGET="all"
    TARGET_REASON="the codex CLI is on PATH, so target auto-detected as \"all\" (default path + codex generation)"
  else
    DETECTED_TARGET="default"
    TARGET_REASON="the codex CLI is not on PATH, so target auto-detected as \"default\" (pass --target all if codex should also be generated)"
  fi
  TARGET="$(prompt_confirm 'Target' "$DETECTED_TARGET" 'default codex all')"
  if [ "$TARGET" != "$DETECTED_TARGET" ]; then
    TARGET_REASON="interactively overridden from auto-detected \"$DETECTED_TARGET\""
  fi
fi
log "Selected target: $TARGET ($TARGET_REASON)"

# ---------------------------------------------------------------------
# 1. Determine the profile.
# ---------------------------------------------------------------------

if [ "$PROFILE_EXPLICIT" = "1" ]; then
  REASON="explicitly requested via --profile $PROFILE"
else
  if command -v opencode >/dev/null 2>&1; then
    if opencode models 2>/dev/null | grep -q '^github-copilot/'; then
      DETECTED_PROFILE="work"
      REASON="\`opencode models\` on this machine lists a github-copilot/* entry"
    else
      DETECTED_PROFILE="personal"
      REASON="\`opencode models\` on this machine lists no github-copilot/* entry"
    fi
  else
    DETECTED_PROFILE="personal"
    REASON="opencode is not on PATH here, so model-based detection defaulted to personal (pass --profile work if this actually is the work machine)"
  fi
  PROFILE="$(prompt_confirm 'Profile' "$DETECTED_PROFILE" 'personal work')"
  if [ "$PROFILE" != "$DETECTED_PROFILE" ]; then
    REASON="interactively overridden from auto-detected \"$DETECTED_PROFILE\""
  fi
fi
log "Selected profile: $PROFILE ($REASON)"

PROFILE_CONFIG="$REPO_ROOT/config/opencode.$PROFILE.jsonc"
if [ ! -f "$PROFILE_CONFIG" ]; then
  echo "install.sh: $PROFILE_CONFIG does not exist." >&2
  exit 1
fi

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] mode: no files will be created, moved, or symlinked."
fi

# ---------------------------------------------------------------------
# Codex target: generates .codex/agents/*.toml inside the repo and
# validates them. Deliberately never touches ~/.codex/config.toml or
# ~/.codex/agents — Codex discovers the project-scoped files on its own
# when the project is trusted, and the user's Codex home is user-owned.
# ---------------------------------------------------------------------

run_codex_generation() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: node scripts/sync-codex-agents.mjs --profile $PROFILE"
    log "[dry-run] would: node scripts/validate.mjs --platform codex"
  else
    log "-> node scripts/sync-codex-agents.mjs --profile $PROFILE"
    node "$REPO_ROOT/scripts/sync-codex-agents.mjs" --profile "$PROFILE"
    log "-> node scripts/validate.mjs --platform codex"
    if ! node "$REPO_ROOT/scripts/validate.mjs" --platform codex; then
      echo "install.sh: codex validation failed — fix the errors above." >&2
      exit 1
    fi
  fi
  log "Codex: repo files only — nothing under \$HOME/.codex was touched (it is user-owned)."
}

if [ "$TARGET" = "codex" ]; then
  run_codex_generation
  log ""
  log "install.sh: done (target=codex, profile=$PROFILE, dry-run=$DRY_RUN)."
  exit 0
fi

# ---------------------------------------------------------------------
# 2. Validate + regenerate the Claude Code agent mirrors for this profile,
#    so what gets symlinked into ~/.claude/agents is always current. This
#    is more than a bare symlink install strictly needs, but installing
#    a stale mirror (or a profile with a silently-missing model entry —
#    see docs/model-routing.md) is exactly the failure mode worth
#    spending one extra step to avoid.
# ---------------------------------------------------------------------

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] would: node scripts/validate.mjs"
  log "[dry-run] would: node scripts/sync-agents.mjs --profile $PROFILE"
else
  log "-> node scripts/validate.mjs"
  if ! node "$REPO_ROOT/scripts/validate.mjs"; then
    echo "install.sh: validate.mjs failed — fix the errors above before installing." >&2
    exit 1
  fi
  log "-> node scripts/sync-agents.mjs --profile $PROFILE"
  node "$REPO_ROOT/scripts/sync-agents.mjs" --profile "$PROFILE"
fi

# ---------------------------------------------------------------------
# 3. Back up and replace ~/.config/opencode/agents/ and ~/.claude/agents/
#    with fresh symlinks into the repo.
# ---------------------------------------------------------------------

install_agent_dir() {
  local target_dir="$1"      # e.g. $HOME/.config/opencode/agents
  local source_dir="$2"      # e.g. $REPO_ROOT/agents
  local label="$3"

  if [ -e "$target_dir" ] || [ -L "$target_dir" ]; then
    act "back up $label ($target_dir -> $target_dir.bak.$TIMESTAMP)" \
      mv "$target_dir" "$target_dir.bak.$TIMESTAMP"
  fi
  act "create $target_dir" mkdir -p "$target_dir"

  local f base
  for f in "$source_dir"/*.md; do
    base="$(basename "$f")"
    act "symlink $target_dir/$base -> $f" ln -s "$f" "$target_dir/$base"
  done
}

install_agent_dir "$HOME/.config/opencode/agents" "$REPO_ROOT/agents" "~/.config/opencode/agents"
install_agent_dir "$HOME/.claude/agents" "$REPO_ROOT/.claude/agents" "~/.claude/agents"

# ---------------------------------------------------------------------
# 4. Symlink skills into ~/.claude/skills/, one directory at a time, so an
#    existing non-symlink skill directory (e.g. the user's own `graphify`)
#    is never touched.
# ---------------------------------------------------------------------

CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
act "ensure $CLAUDE_SKILLS_DIR exists" mkdir -p "$CLAUDE_SKILLS_DIR"

for skill_src in "$REPO_ROOT/.claude/skills"/*/; do
  skill_name="$(basename "$skill_src")"
  skill_target="$CLAUDE_SKILLS_DIR/$skill_name"
  # Strip trailing slash source path for a clean symlink target.
  skill_src="${skill_src%/}"

  if [ -L "$skill_target" ]; then
    act "refresh existing symlink $skill_target -> $skill_src" bash -c \
      'rm "$1" && ln -s "$2" "$1"' _ "$skill_target" "$skill_src"
  elif [ -e "$skill_target" ]; then
    log "WARNING: $skill_target already exists and is not a symlink — skipping (not overwriting a real directory like a hand-authored skill)."
  else
    act "symlink $skill_target -> $skill_src" ln -s "$skill_src" "$skill_target"
  fi
done

# ---------------------------------------------------------------------
# 5. Merge the chosen profile into ~/.config/opencode/opencode.jsonc,
#    preserving every existing key (provider entries, mcp block, etc.)
#    except that the profile's "agent" block wins on conflict.
# ---------------------------------------------------------------------

OC_CONFIG_DIR="$HOME/.config/opencode"
OC_CONFIG="$OC_CONFIG_DIR/opencode.jsonc"

act "ensure $OC_CONFIG_DIR exists" mkdir -p "$OC_CONFIG_DIR"

if [ -f "$OC_CONFIG" ]; then
  act "back up $OC_CONFIG ($OC_CONFIG -> $OC_CONFIG.bak.$TIMESTAMP)" \
    cp "$OC_CONFIG" "$OC_CONFIG.bak.$TIMESTAMP"
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: deep-merge $PROFILE_CONFIG into $OC_CONFIG (existing keys win, except agent.* where the profile wins) via scripts/lib/merge-config.mjs"
  else
    log "-> deep-merge $PROFILE_CONFIG into $OC_CONFIG"
    node "$REPO_ROOT/scripts/lib/merge-config.mjs" "$OC_CONFIG" "$PROFILE_CONFIG" "$OC_CONFIG.merged.tmp"
    mv "$OC_CONFIG.merged.tmp" "$OC_CONFIG"
    log "   NOTE: comments in the pre-existing $OC_CONFIG were not preserved by the merge (JSONC comments don't survive a parse/stringify round-trip). The pre-merge file is at $OC_CONFIG.bak.$TIMESTAMP if you need to recover them."
  fi
else
  act "copy $PROFILE_CONFIG -> $OC_CONFIG (no existing config to merge into)" \
    cp "$PROFILE_CONFIG" "$OC_CONFIG"
fi

# ---------------------------------------------------------------------

if [ "$TARGET" = "all" ]; then
  log ""
  run_codex_generation
fi

log ""
log "install.sh: done (target=$TARGET, profile=$PROFILE, dry-run=$DRY_RUN)."
log "Confirm which model a subagent actually ran on if in doubt (see docs/model-routing.md) —"
log "a partially-merged config degrades to the most expensive model silently,"
log "not to an error."

# ---------------------------------------------------------------------
# 6. Post-install verify: re-run the health checks so a broken install is
#    caught immediately instead of at the next agent invocation.
#    validate.mjs is the hard check (its own abort-on-failure gate already
#    ran earlier in this script; here its output is just surfaced, not
#    re-enforced). doctor.sh is advisory and always exits 0.
# ---------------------------------------------------------------------

log ""
log "Post-install verification:"
if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] would: run scripts/validate.mjs + scripts/doctor.sh (post-install verify)"
else
  node "$REPO_ROOT/scripts/validate.mjs" || true
  bash "$REPO_ROOT/scripts/doctor.sh" || true
fi
