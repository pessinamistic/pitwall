# Resume Handoff — firstmate-inspired build

Written by the orchestrator on 2026-07-20 after the executing `tech-lead`
subagent hit the **session usage limit** (resets 9:20pm Asia/Calcutta) mid-build.
Ground truth below was established by the orchestrator directly (read-only git +
`node` checks), NOT trusted from the dead agent's report — its final "gate green"
claim was **wrong** (see §Broken).

## The task (user's four goals + two added subtasks)
Take inspiration from github.com/kunchenguid/firstmate and build:
1. **Theme** for the six agents — decided: **Scuderia Ferrari / Pit Wall,
   persona-voice only** (keep functional IDs). Specialized from generic F1 to
   Ferrari per the user (a Ferrari + Sebastian Vettel fan): Maranello pit-wall
   framing, Cavallino Rampante / Rosso Corsa / tifosi, "Forza Ferrari"; subtle
   tasteful Vettel nods (#5, 4× champion, "Grazie, ragazzi!" as a done sign-off,
   his meticulous engineer feedback for the Telemetry Engineer / review culture).
   human=Team Principal (Il Commendatore nod), tech-lead=Race Engineer,
   senior-dev=Technical Director, implementer=Mechanic, boilerplate=Tyre Tech,
   code-reviewer=Scrutineer (inspect-only), debugger=Telemetry Engineer.
   Thin consistent skin over the existing instructions — semantics intact.
2. **Copy features** — build only those serving the goals: CI drift-gate,
   doctor/preflight, one-command onboarding, learning skill, parser unit tests.
   Deferred (do NOT build this pass): `.team.yaml`, `/bearings`.
3. **Easy init** — auto-detect `--target`, TTY prompts, root wrapper, post-install verify.
4. **Learning feature** — woven per-project `./.agents/learnings.md` in the TARGET
   repo; inspect-then-update, dated + evidence-backed; tech-lead is the read path
   (reads it during orientation, injects relevant notes into worker briefs); curator
   skill under `.claude/skills/`; three-way routing (cross-project prefs →
   `~/.claude/CLAUDE.md`; project-intrinsic → project CLAUDE.md/AGENTS.md; task
   gotchas → `.agents/learnings.md`; graphify stays the structural map). Commit-vs-
   gitignore of the file left to each project.
5. **Added subtask:** `install.sh` must install `delegate-first` skill for ALL
   targeted harnesses, not just Claude — investigate each harness's skill discovery
   first, extend existing pattern, graceful-skip harnesses with no skills concept.

## DONE and independently verified
- **Wave 0.5 cleanup:** root-level byte-identical duplicates removed (`install.sh`,
  `sync-agents.mjs`, `sync-codex-agents.mjs`, `validate.mjs`, `lib/*.mjs`,
  `package-lock.json`). `antigravity/` + `GEMINI.md` kept.
- **CI drift-gate:** `.github/workflows/ci.yml` (36 lines).
- **doctor/preflight:** `scripts/doctor.sh` (90 lines).
- **onboarding:** `bootstrap.sh` root wrapper (4 lines) + `scripts/install.sh` (+107).
- **parser unit tests:** `scripts/lib/{frontmatter,jsonc,merge-config,toml}.test.mjs`
  — `node --test scripts/lib/*.test.mjs` → **37 pass / 0 fail** (verified).
- **README:** team-table reformat, uncommitted (` M README.md`) — harmless, keep.
- All of the above is COMMITTED (see §Git state). `sync-*.mjs --check` → both idempotent.

## BROKEN — gate is RED, and it is NOT what the dead agent thought
- `node scripts/validate.mjs --platform all` → **6 errors**: every
  `config/opencode.personal.jsonc` model (`github-copilot/claude-sonnet-5`,
  `.../claude-sonnet-4.6`, `.../claude-haiku-4.5`, `.../gpt-5.6-terra`) "not found in
  `opencode models` output on this machine."
- **Root cause is NOT tampering.** Those github-copilot values are the USER'S OWN
  committed config (commit `24a64cb`, author *Shashank Shekhar <…@target.com>*;
  origin has a further edit `dff3b00`). The dead agent misread the user's deliberate
  model change as sabotage and claimed it "restored" them — it did not persist / was
  re-applied by the user's external commit+push path.
- On this machine `opencode models` returns essentially nothing (1 line total) — so
  validate has NO list to verify against. This is an **environment/auth state**
  (github-copilot provider likely not authenticated in opencode here), not proof the
  IDs are wrong. **DECISION REQUIRED FROM USER** — do NOT revert their config.
- (6 pre-existing WARNs on `config/codex.work.jsonc` TODO placeholders are expected.)

## BUILD COMPLETE (2026-07-20) — verified by orchestrator
Waves 2, 3, and the delegate-first-propagation subtask are DONE, senior-dev-reviewed,
and re-verified directly (gate still 6/6 baseline, no new errors; syncs idempotent; all
six agents reskinned Scuderia-style; mirrors match). Working-tree only, no commits.
- **Wave 2 learning feature — DONE:** `.agents/learnings.md`, `docs/learnings.md`,
  `.claude/skills/learnings-curator/SKILL.md`; `agents/tech-lead.md` reads learnings on
  orient + injects them into briefs.
- **Wave 3 Scuderia reskin — DONE (all 6, was actually 0/6 not 2/6).** Persona voice only.
- **delegate-first propagation — DONE:** `antigravity/install.sh` now mirrors ALL
  `.claude/skills/*` → `~/.gemini/skills/`; Codex graceful-skipped (no skill mechanism);
  OpenCode/Claude already covered.

## STILL OPEN
1. **Config/gate decision — RESOLVED.** User confirmed the `config/opencode.personal.jsonc`
   `github-copilot/*` IDs are correct: they're the work-device config, Copilot-authed,
   and the agents were tested working in OpenCode there. The 6 local `validate.mjs` errors
   are a benign environment artifact (this machine isn't Copilot-authed, so `opencode
   models` lists nothing). LEAVE THE CONFIG AS-IS. Two follow-ups opened by this:
   (a) **profile/auto-detect mismatch to investigate** — the installer auto-detects the
   `work` profile when `opencode models` lists github-copilot/*, but the Copilot config
   lives in the `personal` file (work file is TODO placeholders); confirm how the user
   invokes it. (b) **budget-aware model routing** — Copilot premium quota is very tight;
   move high-volume cheap tiers (boilerplate, built-in `plan`, maybe implementer) off
   premium models onto Copilot included/base or local models, reserve premium for the
   senior roles. Needs the user's actual `opencode models` list from the work device.
2. **Branding wave (QUEUED — decisions LOCKED, gated on the running `--target` install
   agent finishing because both touch README/install.sh).** Scope + locked choices:
   - **Images:** primary mark = the **S-roundel** (user picked "round one"); full set
     (hero banner + roundel logo + shields.io badges). Prancing-horse crest = concept
     only, NOT the hero. Design is fixed in the brand kit
     (artifact d0426d38-0830-4ed6-867d-fa84df7689f8; source SVG/HTML in job tmp
     `scuderia-brandkit.html` + `scuderia-banner.svg`). Place finalized SVGs in `assets/`.
     Palette Rosso Corsa #E2001A / carbon #0B0C0F / Modena yellow #FFC400. Original art
     only — NO Ferrari trademarks (no cavallino emblem, no Ferrari wordmark).
   - **README:** open-source-friendly rewrite modeled on firstmate's structure
     (badges+hero → What it is → Features → Quick Start → How it works + roster table →
     Learning feature → Skills → Documentation → Contributing → License), themed in the
     Scuderia identity.
   - **`LICENSE` = MIT.** Add `CONTRIBUTING.md`.
   - **Rename `opencode_agents` → `scuderia`** (see QUEUED NEXT section): refs → GitHub
     repo (`gh repo rename`, confirm first) → local dir + symlink re-point (last).

## QUEUED NEXT — rename project `opencode_agents` → `scuderia`
User-chosen name (Scuderia Ferrari theme; "a stable of specialist agents"). Run this
as a self-contained wave AFTER the current build completes (it edits the same files —
README, install.sh, docs, agents — so a concurrent rename would collide; and the local
dir must not be renamed while an agent is running in it). Three moves:
- **A. In-repo text refs (trivial):** only **2 tracked references** (`scripts/README.md`,
  `scripts/install.sh`) + the top-level README project title + the handoff docs. No
  `package.json` name field exists. → boilerplate/implementer.
- **B. GitHub repo rename:** `gh repo rename scuderia` (from the repo; GitHub auto-
  redirects the old URL, updates `origin`). Outward-facing — CONFIRM with user before firing.
- **C. Local dir + symlinks (do LAST, careful):** rename
  `/Users/pessinamistic/Documents/projects/opencode_agents` → `.../scuderia`, then
  re-run `scripts/install.sh` to re-point the live symlinks (`~/.claude/agents/*` →
  this repo, `~/.config/opencode/*`) which otherwise break. User must reopen the
  session/cd into the new path afterward. Do NOT rename the dir mid-session while a
  subagent is running in it.

## SESSION PAUSE — Claude budget ~93% (2026-07-21)
Near the session limit — heavy multi-agent work is PAUSED to avoid dying mid-task. Resume
when budget resets / user confirms.

DONE since last update:
- **Per-harness `--target` in `scripts/install.sh` — DONE, orchestrator-verified**
  (opencode/claude/codex/antigravity individually selectable + combos + `default`/`all`
  aliases; auto-detect; bogus→exit 1; gate still 6/6). Worker flagged two reversible
  interpretive calls (validate gate fires only when opencode selected; post-install
  verify always runs, incl. codex-only). **Code-review of this risky rewrite is DEFERRED**
  — my own dry-run isolation + gate + `bash -n` checks passed.
- **Brand assets created:** `assets/logo.svg` (roundel) + `assets/banner.svg` (hero),
  finalized to the approved brand kit (artifact d0426d38-0830-4ed6-867d-fa84df7689f8).

DEFERRED — ready to launch, need budget:
- **Code-review** of the `scripts/install.sh` rewrite (code-reviewer, read-only).
- **Branding wave** (tech-lead): README rewrite (firstmate structure + Scuderia identity;
  PRESERVE the new per-harness `--target` Quickstart the install agent added; embed
  `assets/banner.svg` + `logo.svg`; badges → repo path `pessinamistic/scuderia`) +
  `LICENSE` (MIT) + `CONTRIBUTING.md` + in-repo rename `opencode_agents`→`scuderia`
  (only remaining tracked ref: `scripts/README.md:1`). EXCLUDE the `gh repo rename` and
  the local-dir rename — orchestrator + user do those.

## BUDGET-AWARE MODEL ROUTING (user supplied work-device Copilot model list)
Problem: all 6 agents route to premium Copilot models, draining a tight premium-request quota.
Available (all `github-copilot/*`): haiku-4.5; sonnet-4.5/4.6/5; opus-4.5/4.6/4.6-fast/4.7/
4.7-fast/4.8/4.8-fast; gemini-2.5-pro, gemini-3.5-flash; gpt-5-mini, gpt-5.3-codex, gpt-5.4,
gpt-5.4-mini, gpt-5.5, gpt-5.6-luna/sol/terra; kimi-k2.7-code; mai-code-1-flash-picker.
Proposed tiering (cheap for high-volume, premium reserved for the few-call senior roles):
- boilerplate + built-in `plan` → cheapest: `gpt-5-mini` or `gemini-3.5-flash`
- implementer → mid code-tuned: `gpt-5.3-codex` (alt `claude-sonnet-4.5`)
- code-reviewer + debugger → reasoning-mid: `gpt-5.6-terra` (alt `claude-sonnet-4.6`)
- senior-dev → strong, sparse: `claude-sonnet-5`
- tech-lead → strongest, fewest calls: `claude-sonnet-5` (alt `claude-opus-4.8-fast`)
OPEN DECISIONS (user):
1. **Profile placement** — Copilot config sits in `opencode.personal.jsonc`, but install
   auto-detect picks `work` when Copilot is present → would load `opencode.work.jsonc`
   (TODO placeholders). Move config to `opencode.work.jsonc` (recommended) or keep in
   `personal` + always pass `--profile personal`?
2. **Aggressiveness** — max-savings (above) vs. more capability on implementer/reviewer.
3. **Confirm 0×/low-multiplier models** on their plan (visible as "Nx" in the Copilot
   picker) so the truly-free ones go on the cheap tier.

## Git state (external commit+push path is ACTIVE on this repo)
- Local HEAD `d4041f1`; `origin/main` is **1 ahead** (`dff3b00`, a user config edit
  we don't have locally). Working tree: only ` M README.md` uncommitted.
- Commits `24a64cb`, `d4041f1`, `dff3b00` were authored/pushed by the user's own
  identity/tooling during the build — the orchestrator never ran commit/push.
- **Constraint stands:** resume workers must NOT `git commit`/`push`/rewrite history;
  leave changes in the working tree. (Be aware the user's external path may commit them.)

## Constraints for the resuming tech-lead
- No worktree. Zero npm deps (Node ≥ 20) — escalate any dep need.
- `agents/*.md` is single source of truth; never hand-edit mirrors — edit source,
  re-run `sync-agents.mjs` + `sync-codex-agents.mjs`, confirm `--check` clean.
- Gate: `node scripts/validate.mjs --platform all` (interpret the config errors per the
  user's decision — they may be an env/auth artifact, not a code defect).
- senior-dev/code-reviewer sign-off on any `agents/*.md` or script change.
- firstmate reference clone: `/private/tmp/claude-501/-Users-pessinamistic-Documents-projects-opencode-agents/e636296f-b596-48b0-bdd7-b3b0bd2ac913/scratchpad/firstmate`

## Blocker — CLEARED
The earlier session-limit failure (dead agent reported reset 9:20pm) has passed —
user confirmed usage capacity is available **until 4:10 AM**. A fresh `tech-lead`
(resume brief covering the three NOT-DONE items) was relaunched and is running as of
this update; it did not fail on the limit. No further blocker.
