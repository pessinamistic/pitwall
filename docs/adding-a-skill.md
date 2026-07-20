# Adding a skill

Skills live in `.claude/skills/<name>/SKILL.md` — a path both OpenCode and
Claude Code search, so one directory serves both tools. This page is the
constraints checklist and the template for adding one.

## Hard constraints (violations fail silently or in validate.mjs)

1. **The file is literally named `SKILL.md`, all caps.** A `skill.md` (or
   any other casing) is not an error — it is *silently not discovered*.
   This is the single most common reason a skill "doesn't exist."
   `validate.mjs` catches wrong casing with a specific error.
2. **Directory name and frontmatter `name` must be equal**, and both must
   match `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase, digits, single hyphens;
   1–64 chars). `.claude/skills/spring-boot/SKILL.md` must say
   `name: spring-boot`.
3. **`description` is 1–1024 characters** and should end with an explicit
   trigger phrase — "Use whenever writing or reviewing producer/consumer
   code, adding a topic, or debugging message flow." The description is the
   *only* thing an agent sees when deciding whether to load the skill; a
   description without a "use whenever …" trigger makes that decision a
   coin flip. Every skill in this repo follows the pattern.
4. **Only five frontmatter fields are recognized:** `name`, `description`,
   `license`, `compatibility`, and `metadata` (a string → string map).
   Anything else is silently ignored — it won't error, it just does
   nothing.
5. **Names must be globally unique across every skill search path.**
   OpenCode searches multiple locations (per-project and global, under both
   the `.claude` and `.config/opencode` trees), and a name collision
   resolves unpredictably. Before adding a skill, check the name isn't
   already taken in `~/.claude/skills/` or `~/.config/opencode/skills/` on
   the machines that will install this repo — the installer deliberately
   refuses to overwrite an existing real (non-symlink) skill directory
   rather than clobbering a hand-authored one.

## The skeleton

Every skill in this repo follows the same five sections:

```markdown
---
name: my-skill
description: >-
  Conventions for <domain> in this stack — <the four or five specific
  things it covers>. Use whenever <the concrete situations that should
  trigger loading it>.
metadata:
  layer: <messaging|data|platform|practice|...>
---

## When to use this

## Conventions

## Patterns to follow

## Common mistakes

## How to verify
```

**`How to verify` is the section agents need most.** The tech lead's brief
contract requires every worker to prove its work with an exact command, and
this section is where the worker finds it — the real test invocation, the
compatibility check, the lag command. A skill without runnable verification
commands teaches an agent to *claim* correctness; one with them teaches it
to *demonstrate* correctness. Write this section as copy-pasteable commands,
not descriptions of commands.

## Keep it small, keep it conventions

**Under ~200 lines.** Skills load on demand; a bloated skill defeats the
point. If one outgrows that, move the overflow to `references/*.md` files
alongside `SKILL.md` and link to them from the body.

**Skills are conventions, not tutorials.** The model already knows the
technology — what it cannot know is how *this* stack uses it: the decisions
a competent engineer would only learn by reading a lot of the codebase or by
being told.

Concretely, from this repo's `kafka` skill:

- **Good:** topic naming is `<org>.<domain>.<event-name>.v<n>`; consumers
  must be idempotent because delivery is at-least-once, dedupe on the
  business key; retries use non-blocking retry topics routed to a monitored
  `<topic>.dlt`; serialization is Avro with `BACKWARD` compatibility;
  partition key is the aggregate id, never random; and the exact
  `./gradlew` / registry-compatibility commands that verify each of those.
- **Bad:** an explanation of what a Kafka partition is, how consumer groups
  work in general, or a getting-started walkthrough. That is knowledge the
  model already has; putting it in a skill spends load-time tokens to teach
  nothing.

If a value is org-specific (registry URLs, topic prefixes, alert runbooks),
keep the convention generic and flag the substitution with a
`<!-- CUSTOMIZE: ... -->` comment, as the shipped skills do.

## Acceptance check

From the repo root:

```bash
node scripts/validate.mjs
```

It verifies, for every directory under `.claude/skills/`: the `SKILL.md`
casing, frontmatter parseability, `name` ↔ directory equality, the name
regex, and the description length bounds. Exit code 0 with no new errors
means the skill is structurally sound; whether the *content* is a
convention rather than a tutorial is on you.
