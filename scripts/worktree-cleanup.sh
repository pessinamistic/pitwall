#!/usr/bin/env bash
# scripts/worktree-cleanup.sh -- sweeps prunable git worktrees and deletes
# local branches that are provably safe to remove. This is the guardrail
# against per-agent worktrees/branches accumulating (see AGENTS.md, "Run
# scripts/worktree-cleanup.sh to sweep stray worktrees/branches left over
# from prior sessions").
#
# DRY-RUN BY DEFAULT: with no flags this prints exactly what it WOULD
# prune/delete and exits without changing anything. Pass --apply (alias:
# --force) to actually perform the deletions. This default-safe design is
# the whole point -- it is meant to be run freely, by anyone, at any time.
#
# Usage:
#   scripts/worktree-cleanup.sh              dry run (default, safe, no changes)
#   scripts/worktree-cleanup.sh --apply       actually prune worktrees / delete branches
#   scripts/worktree-cleanup.sh --force       alias for --apply
#   scripts/worktree-cleanup.sh -h|--help     show this help
#
# What it touches:
#   - Prunable worktrees: administrative entries `git worktree prune`
#     already considers stale (working directory removed by hand, etc).
#     Runs `git worktree prune -v` in apply mode; nothing is invented here,
#     git's own prune logic decides what qualifies.
#   - Local branches, but ONLY when EITHER:
#       (a) the branch is fully merged into `main` (it appears in
#           `git branch --merged main`), OR
#       (b) the branch name matches the auto-generated worktree pattern
#           `worktree-agent-*` AND its tip is an ancestor of `main`
#           (`git merge-base --is-ancestor <branch> main`).
#     `main` itself, the currently checked-out branch (`git branch
#     --show-current`), and any branch checked out in another worktree are
#     always excluded, even if they'd otherwise qualify. Deletion uses
#     `git branch -d` (never -D), so git's own merge check is a second,
#     independent guard on top of the checks above.
#
# What it never touches: remotes (no fetch/push, no `-r`/`-a` branch
# listing feeds a deletion), and it never switches branches or checks out
# a worktree.
#
# Idempotent: run it twice in a row and the second run finds nothing to do.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
cd "$REPO_ROOT"

BASE_BRANCH="main"
APPLY=0

usage() {
  sed -n '2,34p' "$SCRIPT_DIR/worktree-cleanup.sh" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply|--force)
      APPLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "worktree-cleanup.sh: unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log()     { printf '%s\n' "$*"; }
section() { printf '\n== %s ==\n' "$*"; }
would()   { log "  [dry-run] would $*"; }
did()     { log "  -> $*"; }
warn()    { printf '  SKIP: %s\n' "$*" >&2; }

if ! git rev-parse --verify --quiet "refs/heads/$BASE_BRANCH" >/dev/null; then
  echo "worktree-cleanup.sh: no local branch '$BASE_BRANCH' -- refusing to run (this script's safety checks are all relative to $BASE_BRANCH)." >&2
  exit 1
fi

if [ "$APPLY" = "1" ]; then
  log "worktree-cleanup: APPLY mode -- deletions below are real."
else
  log "worktree-cleanup: DRY RUN (default) -- nothing will change. Pass --apply (or --force) to perform these actions."
fi

# ---------------------------------------------------------------------
# 1. Prunable worktrees.
# ---------------------------------------------------------------------
section "Prunable worktrees"

if [ "$APPLY" = "1" ]; then
  prune_output="$(git worktree prune -v)"
else
  prune_output="$(git worktree prune --dry-run -v)"
fi

worktree_count=0
if [ -n "$prune_output" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    worktree_count=$((worktree_count + 1))
    if [ "$APPLY" = "1" ]; then
      did "$line"
    else
      would "prune worktree -- $line"
    fi
  done <<EOF
$prune_output
EOF
else
  log "  none"
fi

# ---------------------------------------------------------------------
# 2. Deletable local branches.
# ---------------------------------------------------------------------
section "Deletable local branches"

current_branch="$(git branch --show-current)"

# Branches checked out in ANY worktree (not just this one) are excluded
# too, even though the task only requires excluding the current one --
# git would refuse to delete these anyway, so this just keeps the dry-run
# report accurate instead of listing something apply mode can't actually do.
checked_out_branches=""
while IFS= read -r line; do
  case "$line" in
    "branch refs/heads/"*)
      checked_out_branches="$checked_out_branches ${line#branch refs/heads/}"
      ;;
  esac
done < <(git worktree list --porcelain)

is_checked_out() {
  case " $checked_out_branches " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

merged_branches=""
while IFS= read -r b; do
  [ -n "$b" ] || continue
  merged_branches="$merged_branches $b"
done < <(git branch --merged "$BASE_BRANCH" --format='%(refname:short)')

is_merged() {
  case " $merged_branches " in
    *" $1 "*) return 0 ;;
    *)        return 1 ;;
  esac
}

deletable_count=0
deleted_count=0

while IFS= read -r branch; do
  [ -n "$branch" ] || continue
  [ "$branch" != "$BASE_BRANCH" ] || continue
  [ "$branch" != "$current_branch" ] || continue

  reason=""
  if is_merged "$branch"; then
    reason="merged into $BASE_BRANCH"
  else
    case "$branch" in
      worktree-agent-*)
        if git merge-base --is-ancestor "$branch" "$BASE_BRANCH" 2>/dev/null; then
          reason="worktree-agent-* pattern, ancestor of $BASE_BRANCH"
        fi
        ;;
    esac
  fi

  [ -n "$reason" ] || continue

  if is_checked_out "$branch"; then
    warn "$branch qualifies ($reason) but is checked out in another worktree -- leaving it alone"
    continue
  fi

  if [ "$APPLY" = "1" ]; then
    if git branch -d "$branch" >/dev/null 2>&1; then
      did "deleted branch $branch ($reason)"
      deleted_count=$((deleted_count + 1))
    else
      warn "git branch -d refused to delete $branch -- leaving it alone"
    fi
  else
    would "delete branch $branch ($reason)"
    deletable_count=$((deletable_count + 1))
  fi
done < <(git branch --format='%(refname:short)')

# ---------------------------------------------------------------------
# 3. Summary.
# ---------------------------------------------------------------------
section "Summary"

if [ "$APPLY" = "1" ]; then
  log "applied: pruned $worktree_count worktree(s), deleted $deleted_count branch(es)."
else
  log "dry-run: would prune $worktree_count worktree(s), delete $deletable_count branch(es)."
  log "re-run with --apply (or --force) to perform these changes."
fi

exit 0
