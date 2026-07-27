#!/usr/bin/env bash
# Installs this repo's agents into any subset of four harnesses --
# OpenCode, Claude Code, Codex, and Antigravity/Gemini -- symlinking (never
# copying) into ~/.config/opencode/, ~/.claude/, this repo's own
# .codex/agents/, and ~/.gemini/ so the repo stays the single source of
# truth. Safe to re-run. See README.md.
#
# Usage:
#   scripts/install.sh [--target <comma-list>] [--profile personal|work] [--dry-run]
#
# --target is a comma-separated list of harnesses, any subset of:
#   opencode      symlink agents/ (plus the generated fleet-primary variants
#                 in agents/fleet/, regenerated first -- see docs/fleet-mode.md)
#                 -> ~/.config/opencode/agents and merge
#                 config/opencode.<profile>.jsonc into ~/.config/opencode/opencode.jsonc
#   claude        regenerate the Claude Code agent mirror, symlink
#                 .claude/agents -> ~/.claude/agents and .claude/skills/* -> ~/.claude/skills
#   codex         generate .codex/agents/*.toml in the REPO only --
#                 never touches ~/.codex/config.toml or ~/.codex/agents
#   antigravity   delegate to antigravity/install.sh ("gemini" is an alias)
#
# Two backward-compatible aliases:
#   default (or omitted)  opencode,claude -- today's historical default path
#   all                   opencode,claude,codex,antigravity -- NOTE: unlike
#                         before, "all" now also runs the antigravity/gemini
#                         step
#
# Selected steps always run in the fixed order opencode -> claude -> codex
# -> antigravity, regardless of the order given on the command line, and a
# de-duplicated set is used if a name (or an alias that expands to it)
# appears more than once.
#
# With no --profile, the profile is auto-detected from `opencode models`
# and the choice (and reason) is printed before anything happens. With no
# --target, the target is auto-detected too: the set of harnesses actually
# present on this machine (opencode on PATH; ~/.claude or claude on PATH;
# codex on PATH; ~/.gemini or gemini on PATH), falling back to "default" if
# none are detected. When stdin is a TTY and --dry-run was not given, any
# auto-detected (not explicitly flagged) value is offered back for
# interactive confirmation/override.

set -euo pipefail
shopt -s nullglob

PROFILE=""
DRY_RUN=0
TARGET=""
TARGET_EXPLICIT=0
FLEET=0
FLEET_EXPLICIT=0

usage() {
  cat <<'USAGE'
Usage: install.sh [--target <comma-list>] [--profile personal|work] [--dry-run]

  --target <comma-list>       Comma-separated list of harnesses to install,
                              any subset of: opencode, claude, codex,
                              antigravity (alias: gemini). Two backward-
                              compatible aliases: "default" = opencode,claude
                              (today's historical default path, also the
                              fallback when auto-detection finds nothing);
                              "all" = opencode,claude,codex,antigravity
                              (NOTE: unlike before, "all" now also runs the
                              antigravity/gemini step). Steps always run in
                              the fixed order opencode -> claude -> codex ->
                              antigravity, regardless of the order given
                              here. When omitted, the target is
                              auto-detected from what's present on this
                              machine.
  --profile personal|work     Force a routing profile instead of auto-detecting.
  --dry-run                   Print every action that would be taken; do nothing.
  --fleet                     Also set up optional fleet mode (tmux
                              orchestration): symlink the pit-wall CLI into
                              ~/.local/bin. Needs tmux; warns and skips if
                              tmux is absent. Off by default. See
                              docs/fleet-mode.md.
  --no-fleet                  Never prompt for or set up fleet mode.
  -h, --help                  Show this help.

Targets, in the fixed run order:
  opencode      symlink agents/ (plus the generated fleet-primary variants
                in agents/fleet/, regenerated first -- see docs/fleet-mode.md)
                -> ~/.config/opencode/agents and merge
                config/opencode.<profile>.jsonc into ~/.config/opencode/opencode.jsonc
  claude        regenerate the Claude Code agent mirror, symlink
                .claude/agents -> ~/.claude/agents and .claude/skills/* -> ~/.claude/skills
  codex         generate .codex/agents/*.toml in the REPO only -- never
                touches ~/.codex/config.toml or ~/.codex/agents
  antigravity   delegate to antigravity/install.sh ("gemini" is an alias)
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
    --fleet)
      FLEET=1
      FLEET_EXPLICIT=1
      shift
      ;;
    --no-fleet)
      FLEET=0
      FLEET_EXPLICIT=1
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

# Captured before auto-detection overwrites PROFILE, so the interactive
# prompt below only offers a confirmation for values that were *detected*,
# never for one the user already pinned down with a flag.
PROFILE_EXPLICIT=0
[ -n "$PROFILE" ] && PROFILE_EXPLICIT=1

# Prompt to confirm/override an auto-detected value, but only when stdin is
# a TTY and --dry-run was not given -- never for a non-interactive/CI run,
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

# Same interactive-confirm shape as prompt_confirm above, but --target's
# valid values are combinatorial (any comma-separated subset of four names
# plus two aliases) rather than a small fixed whitelist, so the override is
# validated afterward by expand_target instead of against an exhaustive
# list here.
prompt_confirm_target() {
  # prompt_confirm_target <detected-comma-list>
  local detected="$1" input=""
  [ -t 0 ] || { printf '%s' "$detected"; return 0; }
  [ "$DRY_RUN" = "1" ] && { printf '%s' "$detected"; return 0; }
  read -r -p "Target [comma list of opencode,claude,codex,antigravity (or gemini); default; all] (Enter to accept \"$detected\"): " input || input=""
  if [ -z "$input" ]; then
    printf '%s' "$detected"
  else
    printf '%s' "$input"
  fi
}

# Repo location is derived from this script's own path -- never hardcoded --
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

# expand_target <comma-separated list> -- parses into the SEL_OPENCODE /
# SEL_CLAUDE / SEL_CODEX / SEL_ANTIGRAVITY globals (each "0" or "1"),
# expanding the "default"/"all" aliases and the "gemini" alias for
# antigravity, and de-duplicating repeats (setting the same flag twice is a
# no-op). Steps still run in the fixed order opencode -> claude -> codex ->
# antigravity regardless of the order given here. Exits non-zero with a
# clear message listing the valid names on an unknown token.
KNOWN_TARGET_NAMES="opencode, claude, codex, antigravity (alias: gemini), default (= opencode,claude), all (= opencode,claude,codex,antigravity)"

expand_target() {
  local raw="$1" token trimmed
  SEL_OPENCODE=0
  SEL_CLAUDE=0
  SEL_CODEX=0
  SEL_ANTIGRAVITY=0
  local IFS=','
  for token in $raw; do
    trimmed="$(printf '%s' "$token" | tr -d '[:space:]')"
    case "$trimmed" in
      "") continue ;;
      opencode)           SEL_OPENCODE=1 ;;
      claude)             SEL_CLAUDE=1 ;;
      codex)              SEL_CODEX=1 ;;
      antigravity|gemini) SEL_ANTIGRAVITY=1 ;;
      default)            SEL_OPENCODE=1; SEL_CLAUDE=1 ;;
      all)                SEL_OPENCODE=1; SEL_CLAUDE=1; SEL_CODEX=1; SEL_ANTIGRAVITY=1 ;;
      *)
        echo "install.sh: --target: unknown name \"$trimmed\" (in \"$raw\")." >&2
        echo "install.sh: valid names: $KNOWN_TARGET_NAMES." >&2
        exit 1
        ;;
    esac
  done
  if [ "$SEL_OPENCODE" = "0" ] && [ "$SEL_CLAUDE" = "0" ] && [ "$SEL_CODEX" = "0" ] && [ "$SEL_ANTIGRAVITY" = "0" ]; then
    echo "install.sh: --target \"$raw\" selected nothing to install." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------
# Back up and replace a target agents directory with a fresh symlink tree
# into the repo. Shared by the opencode and claude steps below.
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

# ---------------------------------------------------------------------
# install_skills <skills_dir> -- symlink every directory under
# .claude/skills/ into <skills_dir>, one at a time, so an existing
# non-symlink skill directory (e.g. the user's own `graphify`) is never
# overwritten. Shared by the opencode and claude steps. OpenCode discovers
# skills from both ~/.config/opencode/skills and ~/.claude/skills and
# dedupes by name, so installing into both when both harnesses are selected
# is safe -- no skill is double-listed.
# ---------------------------------------------------------------------

install_skills() {
  local skills_dir="$1"
  act "ensure $skills_dir exists" mkdir -p "$skills_dir"

  local skill_src skill_name skill_target
  for skill_src in "$REPO_ROOT/.claude/skills"/*/; do
    skill_name="$(basename "$skill_src")"
    skill_target="$skills_dir/$skill_name"
    # Strip trailing slash source path for a clean symlink target.
    skill_src="${skill_src%/}"

    if [ -L "$skill_target" ]; then
      # $1/$2 must expand inside the bash -c subshell, not the parent shell.
      # shellcheck disable=SC2016
      act "refresh existing symlink $skill_target -> $skill_src" bash -c \
        'rm "$1" && ln -s "$2" "$1"' _ "$skill_target" "$skill_src"
    elif [ -e "$skill_target" ]; then
      log "WARNING: $skill_target already exists and is not a symlink — skipping (not overwriting a real directory like a hand-authored skill)."
    else
      act "symlink $skill_target -> $skill_src" ln -s "$skill_src" "$skill_target"
    fi
  done
}

# ---------------------------------------------------------------------
# opencode step: regenerate the fleet-primary agent variants (so what gets
# symlinked below is always current -- same "regenerate before validating"
# pattern the claude/codex steps use for their own generators), the shared
# validate.mjs gate (the full, all-platform contract check -- catches a
# repo-wide problem before anything is written under $HOME), then the
# agents symlink and the opencode.jsonc profile merge. Runs only when
# opencode itself is selected.
# ---------------------------------------------------------------------

install_opencode() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: node scripts/sync-fleet-agents.mjs --profile $PROFILE"
  else
    log "-> node scripts/sync-fleet-agents.mjs --profile $PROFILE"
    node "$REPO_ROOT/scripts/sync-fleet-agents.mjs" --profile "$PROFILE"
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: node scripts/validate.mjs"
  else
    log "-> node scripts/validate.mjs"
    if ! node "$REPO_ROOT/scripts/validate.mjs"; then
      echo "install.sh: validate.mjs failed — fix the errors above before installing." >&2
      exit 1
    fi
  fi

  local profile_config="$REPO_ROOT/config/opencode.$PROFILE.jsonc"
  if [ ! -f "$profile_config" ]; then
    echo "install.sh: $profile_config does not exist." >&2
    exit 1
  fi

  # Back up and replace ~/.config/opencode/agents/ with a fresh symlink.
  # Last arg is a decorative label only, not a path operand (the real path is the arg before it).
  # shellcheck disable=SC2088
  install_agent_dir "$HOME/.config/opencode/agents" "$REPO_ROOT/agents" "~/.config/opencode/agents"

  # Additive: fleet-primary agent variants (agents/fleet/*.md, generated
  # above; see docs/fleet-mode.md and scripts/sync-fleet-agents.mjs),
  # symlinked into the SAME directory the call just above just (re)created
  # -- not backed up a second time, since install_agent_dir already moved
  # anything that was there (including a previous run's fleet-*.md
  # symlinks) into its own timestamped backup an instant ago, so this
  # always starts from an empty, freshly-made directory. Needed because
  # `opencode run --agent <name>` (fleet mode's opencode backend) requires
  # a primary-mode agent for a top-level invocation, and only tech-lead
  # among the six source roles is mode: primary -- confirmed empirically
  # that OpenCode's global agent directory is the reliable discovery path
  # for fleet mode's actual usage pattern (its tmux window cwd is wherever
  # `pit-wall.sh spawn` was invoked from, which may be any project, not
  # necessarily this repo's own checkout).
  local fleet_src_dir="$REPO_ROOT/agents/fleet"
  local fleet_target_dir="$HOME/.config/opencode/agents"
  local fleet_f fleet_base
  for fleet_f in "$fleet_src_dir"/*.md; do
    fleet_base="$(basename "$fleet_f")"
    act "symlink $fleet_target_dir/$fleet_base -> $fleet_f" ln -s "$fleet_f" "$fleet_target_dir/$fleet_base"
  done

  # Merge the chosen profile into ~/.config/opencode/opencode.jsonc,
  # preserving every existing key (provider entries, mcp block, etc.)
  # except that the profile's "agent" block wins on conflict.
  local oc_config_dir="$HOME/.config/opencode"
  local oc_config="$oc_config_dir/opencode.jsonc"

  act "ensure $oc_config_dir exists" mkdir -p "$oc_config_dir"

  if [ -f "$oc_config" ]; then
    act "back up $oc_config ($oc_config -> $oc_config.bak.$TIMESTAMP)" \
      cp "$oc_config" "$oc_config.bak.$TIMESTAMP"
    if [ "$DRY_RUN" = "1" ]; then
      log "[dry-run] would: deep-merge $profile_config into $oc_config (existing keys win, except agent.* where the profile wins) via scripts/lib/merge-config.mjs"
    else
      log "-> deep-merge $profile_config into $oc_config"
      node "$REPO_ROOT/scripts/lib/merge-config.mjs" "$oc_config" "$profile_config" "$oc_config.merged.tmp"
      mv "$oc_config.merged.tmp" "$oc_config"
      log "   NOTE: comments in the pre-existing $oc_config were not preserved by the merge (JSONC comments don't survive a parse/stringify round-trip). The pre-merge file is at $oc_config.bak.$TIMESTAMP if you need to recover them."
    fi
  else
    act "copy $profile_config -> $oc_config (no existing config to merge into)" \
      cp "$profile_config" "$oc_config"
  fi

  # Symlink skills into ~/.config/opencode/skills/ so an opencode-only
  # install still provisions them. OpenCode also reads ~/.claude/skills and
  # dedupes by name, so this overlaps harmlessly when claude is selected too.
  install_skills "$HOME/.config/opencode/skills"
}

# ---------------------------------------------------------------------
# claude step: regenerate the Claude Code agent mirrors for this profile
# (so what gets symlinked is always current), then symlink .claude/agents
# and every directory under .claude/skills/. Runs only when claude itself
# is selected -- it does not depend on the opencode step's validate.mjs gate.
# ---------------------------------------------------------------------

install_claude() {
  if [ "$DRY_RUN" = "1" ]; then
    log "[dry-run] would: node scripts/sync-agents.mjs --profile $PROFILE"
  else
    log "-> node scripts/sync-agents.mjs --profile $PROFILE"
    node "$REPO_ROOT/scripts/sync-agents.mjs" --profile "$PROFILE"
  fi

  # Last arg is a decorative label only, not a path operand (the real path is the arg before it).
  # shellcheck disable=SC2088
  install_agent_dir "$HOME/.claude/agents" "$REPO_ROOT/.claude/agents" "~/.claude/agents"

  # Symlink skills into ~/.claude/skills/ (Claude Code's skill search path).
  install_skills "$HOME/.claude/skills"
}

# ---------------------------------------------------------------------
# codex step: generates .codex/agents/*.toml inside the repo and validates
# them. Deliberately never touches ~/.codex/config.toml or ~/.codex/agents
# -- Codex discovers the project-scoped files on its own when the project
# is trusted, and the user's Codex home is user-owned. Composes with any
# other selected step (no early exit).
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
  log "Codex: no skill-file discovery mechanism today (see docs/codex.md) — .claude/skills/*"
  log "       (including delegate-first) do not apply to Codex. This is an expected,"
  log "       graceful skip, not a failure."
}

# ---------------------------------------------------------------------
# antigravity step: delegates entirely to antigravity/install.sh, which is
# the single source of truth for that harness's symlinks (~/.gemini/skills/,
# ~/.gemini/rules/). --dry-run is passed through so its own dry-run
# reporting is what's shown here -- nothing in this script duplicates its
# logic, and antigravity/install.sh remains runnable standalone.
# ---------------------------------------------------------------------

install_antigravity() {
  log "-> delegating to antigravity/install.sh"
  if [ "$DRY_RUN" = "1" ]; then
    if ! bash "$REPO_ROOT/antigravity/install.sh" --dry-run; then
      echo "install.sh: antigravity/install.sh --dry-run failed." >&2
      exit 1
    fi
  else
    if ! bash "$REPO_ROOT/antigravity/install.sh"; then
      echo "install.sh: antigravity/install.sh failed." >&2
      exit 1
    fi
  fi
}

# ---------------------------------------------------------------------
# fleet step (optional, opt-in): make the pit-wall CLI available for fleet
# mode (tmux orchestration). Needs tmux; if it is absent we warn and skip
# rather than fail, because fleet mode is opt-in. Symlinks (never copies,
# never clobbers a real file) scripts/fleet/pit-wall.sh into ~/.local/bin,
# mirroring how skills are linked. See docs/fleet-mode.md.
# ---------------------------------------------------------------------

install_fleet() {
  if ! command -v tmux >/dev/null 2>&1; then
    log "fleet: tmux is not installed — fleet mode needs it (e.g. brew install tmux)."
    log "fleet: skipping fleet setup (re-run with --fleet once tmux is available)."
    return 0
  fi
  local bindir="$HOME/.local/bin" link src
  link="$bindir/pit-wall"
  src="$REPO_ROOT/scripts/fleet/pit-wall.sh"
  act "ensure $bindir exists" mkdir -p "$bindir"
  if [ -L "$link" ]; then
    # $1/$2 must expand inside the bash -c subshell, not the parent shell.
    # shellcheck disable=SC2016
    act "refresh existing symlink $link -> $src" bash -c \
      'rm "$1" && ln -s "$2" "$1"' _ "$link" "$src"
  elif [ -e "$link" ]; then
    log "fleet: WARNING: $link already exists and is not a symlink — leaving it alone."
  else
    act "symlink $link -> $src" ln -s "$src" "$link"
  fi
  case ":$PATH:" in
    *":$bindir:"*) : ;;
    *)
      # Decorative note; the ~ is literal message text, not a path operand.
      # shellcheck disable=SC2088
      log "fleet: NOTE: ~/.local/bin is not on your PATH — add it, or run $src directly." ;;
  esac
  log "fleet: ready — try 'pit-wall spawn implementer \"...\"' (see docs/fleet-mode.md)."
}

# ---------------------------------------------------------------------
# 0. Determine the target: a de-duplicated set of harnesses to install,
#    selected from {opencode, claude, codex, antigravity}. See expand_target
#    above for the alias rules.
# ---------------------------------------------------------------------

if [ "$TARGET_EXPLICIT" = "1" ]; then
  TARGET_REASON="explicitly requested via --target $TARGET"
else
  DETECTED_LIST=()
  DETECT_REASONS=()
  if command -v opencode >/dev/null 2>&1; then
    DETECTED_LIST+=(opencode)
    DETECT_REASONS+=("opencode CLI on PATH")
  fi
  if [ -d "$HOME/.claude" ] || command -v claude >/dev/null 2>&1; then
    DETECTED_LIST+=(claude)
    # Decorative label only, not a path operand.
    # shellcheck disable=SC2088
    DETECT_REASONS+=("~/.claude exists or claude CLI on PATH")
  fi
  if command -v codex >/dev/null 2>&1; then
    DETECTED_LIST+=(codex)
    DETECT_REASONS+=("codex CLI on PATH")
  fi
  if [ -d "$HOME/.gemini" ] || command -v gemini >/dev/null 2>&1; then
    DETECTED_LIST+=(antigravity)
    # Decorative label only, not a path operand.
    # shellcheck disable=SC2088
    DETECT_REASONS+=("~/.gemini exists or gemini CLI on PATH")
  fi

  if [ "${#DETECTED_LIST[@]}" -eq 0 ]; then
    DETECTED_TARGET="default"
    TARGET_REASON="none of opencode/claude/codex/antigravity were detected on this machine, so target auto-detected as \"default\" (opencode,claude) — today's historical default path (pass --target explicitly to opt into any harness)"
  else
    DETECTED_TARGET="$(IFS=,; echo "${DETECTED_LIST[*]}")"
    JOINED_REASONS="$(printf '; %s' "${DETECT_REASONS[@]}")"
    JOINED_REASONS="${JOINED_REASONS#; }"
    TARGET_REASON="auto-detected as \"$DETECTED_TARGET\" ($JOINED_REASONS)"
  fi

  TARGET="$(prompt_confirm_target "$DETECTED_TARGET")"
  if [ "$TARGET" != "$DETECTED_TARGET" ]; then
    TARGET_REASON="interactively overridden from auto-detected \"$DETECTED_TARGET\""
  fi
fi

expand_target "$TARGET"
log "Selected target: $TARGET ($TARGET_REASON)"

SELECTED_STEPS=""
if [ "$SEL_OPENCODE" = "1" ]; then SELECTED_STEPS="$SELECTED_STEPS opencode"; fi
if [ "$SEL_CLAUDE" = "1" ]; then SELECTED_STEPS="$SELECTED_STEPS claude"; fi
if [ "$SEL_CODEX" = "1" ]; then SELECTED_STEPS="$SELECTED_STEPS codex"; fi
if [ "$SEL_ANTIGRAVITY" = "1" ]; then SELECTED_STEPS="$SELECTED_STEPS antigravity"; fi
log "Steps to run, in order:$SELECTED_STEPS"

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

# Optional fleet-mode setup is off unless requested. When interactive and not
# already decided by --fleet/--no-fleet, offer it once (default no).
if [ "$FLEET_EXPLICIT" != "1" ] && [ -t 0 ] && [ "$DRY_RUN" != "1" ]; then
  fleet_ans=""
  read -r -p "Set up optional fleet mode (tmux orchestration)? [y/N]: " fleet_ans || fleet_ans=""
  case "$fleet_ans" in y|Y|yes|YES|Yes) FLEET=1 ;; *) FLEET=0 ;; esac
fi
[ "$FLEET" = "1" ] && log "Fleet mode: will set up (optional; needs tmux)."

if [ "$DRY_RUN" = "1" ]; then
  log "[dry-run] mode: no files will be created, moved, or symlinked."
fi

# ---------------------------------------------------------------------
# 2. Run the selected steps, in the fixed order opencode -> claude -> codex
#    -> antigravity, regardless of what order was given on the command
#    line.
# ---------------------------------------------------------------------

if [ "$SEL_OPENCODE" = "1" ]; then
  log ""
  log "== opencode =="
  install_opencode
fi

if [ "$SEL_CLAUDE" = "1" ]; then
  log ""
  log "== claude =="
  install_claude
fi

if [ "$SEL_CODEX" = "1" ]; then
  log ""
  log "== codex =="
  run_codex_generation
fi

if [ "$SEL_ANTIGRAVITY" = "1" ]; then
  log ""
  log "== antigravity =="
  install_antigravity
fi

if [ "$FLEET" = "1" ]; then
  log ""
  log "== fleet (optional) =="
  install_fleet
fi

log ""
log "install.sh: done (target=$TARGET, profile=$PROFILE, dry-run=$DRY_RUN)."
if [ "$SEL_OPENCODE" = "1" ]; then
  log "Confirm which model a subagent actually ran on if in doubt (see docs/model-routing.md) —"
  log "a partially-merged config degrades to the most expensive model silently,"
  log "not to an error."
fi

# ---------------------------------------------------------------------
# 3. Post-install verify: re-run the health checks so a broken install is
#    caught immediately instead of at the next agent invocation. Runs once,
#    regardless of which subset of steps was selected -- but scoped to only
#    the platform(s) actually selected this run (one `--platform <name>`
#    call per selected SEL_* flag, in the same fixed order as the install
#    steps above), so e.g. `install.sh --target codex` doesn't surface
#    unrelated OpenCode config errors. validate.mjs is the hard check (its
#    own abort-on-failure gates already ran earlier in this script, per
#    selected step; here its output is just surfaced, not re-enforced).
#    doctor.sh is advisory, not platform-specific, and always exits 0 -- it
#    still runs unconditionally.
# ---------------------------------------------------------------------

log ""
log "Post-install verification:"
if [ "$DRY_RUN" = "1" ]; then
  for entry in "opencode:$SEL_OPENCODE" "claude:$SEL_CLAUDE" "codex:$SEL_CODEX" "antigravity:$SEL_ANTIGRAVITY"; do
    platform="${entry%%:*}"
    selected="${entry##*:}"
    [ "$selected" = "1" ] && log "[dry-run] would: run scripts/validate.mjs --platform $platform"
  done
  log "[dry-run] would: run scripts/doctor.sh (advisory, always runs)"
else
  for entry in "opencode:$SEL_OPENCODE" "claude:$SEL_CLAUDE" "codex:$SEL_CODEX" "antigravity:$SEL_ANTIGRAVITY"; do
    platform="${entry%%:*}"
    selected="${entry##*:}"
    if [ "$selected" = "1" ]; then
      log "-> node scripts/validate.mjs --platform $platform"
      node "$REPO_ROOT/scripts/validate.mjs" --platform "$platform" || true
    fi
  done
  bash "$REPO_ROOT/scripts/doctor.sh" || true
fi
