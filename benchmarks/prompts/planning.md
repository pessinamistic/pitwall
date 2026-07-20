---
category: planning
expects:
  - "/\b[1-9]\.|step\s*1\b/i"
  - "/migration|schema/i"
  - "/test|tests/i"
  - "/depends on|after step|blocked by|prerequisite/i"
  - "/rollout|feature flag|monitor|rollback/i"
---

# Task: plan the feature

Feature request: **"Add per-API-key rate limiting to our public REST API."**

Current state: a Node.js/Express API with a Postgres database, no existing
rate-limiting infrastructure, and a Redis instance already used for session
caching. API keys are issued per customer and stored in an `api_keys` table.

Decompose this feature into an ordered list of concrete implementation steps.
For each step:

- Give it a number.
- State what it produces (a file, a schema change, a config value, etc).
- State its dependencies explicitly — which earlier step(s) it needs done
  first, using the phrase "depends on step N" (or "no dependencies" for steps
  that can start immediately).

Cover schema/data changes, the core rate-limiting logic, configuration
(limits per plan tier), tests, and a safe rollout plan (how you'd ship this
without locking out real customers if the limits are miscalibrated).

Respond with text only — do not use any tools, do not write or edit files.
