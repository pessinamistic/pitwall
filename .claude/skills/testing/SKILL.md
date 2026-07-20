---
name: testing
description: >-
  Testing conventions across this stack — the test pyramid split between
  unit, slice, integration, and contract tests, naming and structure,
  Testcontainers usage instead of mocks for infra, and coverage gates. Use
  whenever writing tests for new code, reviewing test coverage on a diff,
  or deciding what kind of test a piece of logic needs.
metadata:
  layer: practice
---

## When to use this

Writing any new test, deciding what test level a change needs, or
reviewing whether a diff's tests actually prove the behavior. Complements
the language/framework skills — this one is about test *strategy and
structure*, not the code under test.

## Conventions

- **Test pyramid, four levels, and each change should land at the lowest
  level that proves it:**
  1. **Unit** — JUnit 5 + Mockito, no Spring context, pure business logic
     (services, mappers, domain objects). Fast (milliseconds), the bulk of
     the suite.
  2. **Slice** — `@WebMvcTest`, `@DataJpaTest`, `@JsonTest` etc., loading
     only the relevant Spring slice, for controller serialization,
     repository query correctness, and validation wiring.
  3. **Integration** — full `@SpringBootTest` against real infrastructure
     via **Testcontainers** (Postgres, Mongo, Kafka, Redis, Elasticsearch
     as needed) — never against mocked infra and never against a shared
     "test" environment. Every service brings up its own containers per
     test run.
  4. **Contract** — Spring Cloud Contract (or Pact) tests at the boundary
     between two services, run in both the producer's and consumer's CI,
     to catch breaking API/event changes before they reach a shared
     environment.
- **Naming:** `methodUnderTest_condition_expectedOutcome`, e.g.
  `createOrder_whenInventoryInsufficient_throwsConflictException`. Test
  classes mirror the production class name with a `Test`/`IT` suffix
  (`OrderService` → `OrderServiceTest` unit, `OrderServiceIT` integration).
- **Testcontainers, not mocks, for infrastructure.** Mocking a
  `KafkaTemplate`, a Mongo repository, or a JDBC connection to "unit test"
  what is really an integration concern hides real serialization/query
  bugs. Reserve Mockito for collaborators that are genuinely another unit
  of your own business logic, not for infra clients.
- **Coverage gate enforced by Jacoco in CI**, measured per module, failing
  the build below threshold — coverage is a floor that catches untested
  branches, not a target to game with trivial assertions.
  <!-- CUSTOMIZE: set the actual threshold (e.g. 80% line, 70% branch) and
  confirm whether it's enforced per-module or repo-wide -->
- **Test data via builders, not fixture duplication.** A `OrderTestData.aValidOrder()`-style
  builder with sensible defaults and `.with...()` overrides for the field
  under test, so tests don't repeat 15 lines of full-object construction
  and don't silently drift from the real constructor/record shape.
- **No `Thread.sleep` in tests.** Async assertions (Kafka consumption,
  eventual index updates) use Awaitility (`await().atMost(...).until(...)`),
  which fails fast on the real condition instead of a fixed guess at
  timing.

## Patterns to follow

- Given/when/then structure inside a test method body (as comments or
  blank-line separation), even without a BDD framework, so intent is
  legible without reading the assertion first.
- One behavior per test method — a test named for one outcome that also
  asserts three unrelated things fails unhelpfully when it breaks.
- Integration tests share a common base class per service
  (`AbstractIntegrationTest`) that starts the Testcontainers once per test
  class (`@Testcontainers` + static containers) rather than per method, to
  keep the suite fast.

## Common mistakes

- Mocking the repository/Kafka template in what's billed as an
  "integration test" — that's a unit test wearing the wrong name, and it
  will not catch a real query or serialization bug.
- Asserting only the happy path and skipping the failure/edge case that
  the method exists to handle (e.g. testing `createOrder` succeeds but
  never testing the insufficient-inventory rejection).
- Flaky `Thread.sleep`-based waits for async behavior instead of
  Awaitility, which either wastes time (sleep too long) or flakes in CI
  (sleep too short).
- Writing a contract test only on one side of a service boundary — it
  must run in both the producer's and the consumer's CI to catch a
  breaking change either side introduces.
- Chasing the coverage number with tests that call a method and assert
  nothing meaningful, which passes the gate without proving behavior.

## How to verify

```bash
# Run only unit tests (fast feedback loop)
./gradlew test --tests '*Test'

# Run integration tests (spins up Testcontainers)
./gradlew test --tests '*IT'

# Run one specific test class while iterating
./gradlew test --tests '*OrderServiceTest'

# Full module verification including coverage gate
./gradlew :orders-service:check jacocoTestCoverageVerification

# Run contract tests against the currently published consumer contracts
./gradlew contractTest
```
