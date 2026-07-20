# Writing task briefs

The contract between the `tech-lead` and its workers — for anyone extending
the tech-lead prompt, or writing a brief by hand when `@mention`-ing a
worker directly.

## Why the brief is the contract

Worker agents are **stateless**. A worker sees exactly one thing: the prompt
the tech lead wrote for it. It has no access to the tech lead's
conversation, to its plan, or to what any parallel worker is building. If a
fact isn't in the brief, the worker either rediscovers it (slowly, at token
cost) or guesses it (wrongly, at re-work cost).

## The six required elements

Every brief carries all six. The first five are the general contract; the
sixth is this repo's addition.

1. **Exact file paths** to create or modify. Not "add an endpoint to the
   order service" — the path of the controller, the test file, the config
   entry.
2. **A pattern file to imitate.** The single highest-leverage line in any
   brief: "match the existing `UserController`" replaces a whole page of
   style instructions and an exploration pass.
3. **Acceptance criteria and the exact verification command(s).** Workers
   in this repo are required to verify before reporting done, and the
   tech lead treats a report with no command + result as unverified. Name
   the project's real command (`./gradlew test --tests '…'`,
   `npm test -- …`) — a worker told to "run the tests" may guess at a
   runner that doesn't exist.
4. **Interface contracts other parallel tasks depend on.** If a backend
   endpoint and a frontend component are being built in parallel, both
   briefs spell out the shared shape (endpoint path, payload fields, DTO
   names, prop types). Workers cannot see each other; the contract exists
   only if both briefs contain it.
5. **Applicable project constraints** from `CLAUDE.md`/docs — the two or
   three rules that bind *this* task. Workers read the repo's `CLAUDE.md`
   on their own, but constraints buried in architecture docs must be
   surfaced in the brief.
6. **Name the relevant skill.** If a skill covers the task's domain
   ("load the `kafka` skill before writing the consumer"), say so. A worker
   that knows which skill applies skips the discovery pass it would
   otherwise run itself — and the skills' `How to verify` sections feed
   element 3 directly.

## The cost argument

It is tempting to treat cost optimization as a model-assignment problem. In
an orchestrated setup it mostly isn't. The dominant cost is the tech lead's
own context (it reads the docs, holds the task plan, reads every worker report)
multiplied by delegation round-trips. A vague brief that sends a worker into
explore → guess wrong → get re-briefed costs **several times more** than the
model-tier difference saves on that task.

So: **briefs are the primary token optimization; model tiers are the
secondary one.** A budget model with a precise brief beats a premium model
with a vague one — on cost *and* usually on output. This is also why the
worker agents are instructed to stop and punt on ambiguity rather than
guess: a punt costs one round-trip; a wrong guess costs a build, a review,
and a re-brief.

## A good brief

```
Task for implementer:

Add a paginated "list orders by customer" endpoint to the order service.

Files:
- Create: src/main/java/com/example/orders/api/CustomerOrdersController.java
- Create: src/test/java/com/example/orders/api/CustomerOrdersControllerTest.java
- Do not touch the service or repository layers; OrderService.findByCustomerId
  already exists and is the seam to use.

Pattern: match the existing OrderAdminController
(src/main/java/com/example/orders/api/OrderAdminController.java) — same
DTO-mapping style, same error handling via the shared exception handler,
same slice-test setup as OrderAdminControllerTest.

Skill: load the `spring-boot` skill (controller/DTO conventions, API
versioning) and the `testing` skill (slice-test style) before writing.

Interface contract (the frontend task is being built against this in
parallel — do not deviate without reporting back):
- GET /api/v1/customers/{customerId}/orders?page=0&size=20
- Response: { "items": [OrderSummaryDto], "page": int, "totalPages": int }
- OrderSummaryDto: id (uuid), status (string), placedAt (ISO-8601), totalCents (int)

Constraints:
- No new dependencies.
- Pagination follows the existing Pageable convention — see
  OrderAdminController, not a hand-rolled offset/limit pair.

Acceptance:
- ./gradlew test --tests '*CustomerOrdersControllerTest' passes
- ./gradlew :order-service:check passes (includes lint)
Report the exact commands you ran and their results.
```

Every element is present: paths, a pattern, a named skill, a spelled-out
contract the parallel task depends on, the binding constraints, and
verification commands the worker can run without guessing.

## A bad brief

```
Task for implementer:

Add an endpoint so customers can see their orders. Look at how the other
endpoints do it. Make sure it's paginated and tested.
```

What happens next, and what it costs:

- **No paths** → the worker explores the module tree to decide where the
  controller lives (tokens spent re-deriving what the tech lead already
  knew).
- **"Look at how the other endpoints do it"** → there are several patterns
  in any real codebase; the worker picks one — maybe the deprecated one.
- **No interface contract** → the worker invents a response shape; the
  frontend task, briefed equally vaguely, invents a different one. Both
  "pass". Integration fails. Two re-briefs.
- **No verification command** → the report says "tests added"; whether they
  ran, and against which module, is anyone's guess — the tech lead must
  treat the work as unverified and follow up.
- **No skill named** → the worker spends a discovery pass finding the
  conventions the `spring-boot` skill would have handed it.

Each of those failure modes costs a delegation round-trip through the tech
lead's (most expensive) context. The brief above took two minutes to write
badly and will spend more than any model-tier saving recovers.
