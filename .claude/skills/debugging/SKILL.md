---
name: debugging
description: >-
  Method for investigating broken behavior in this stack — reproduce
  before diagnosing, use distributed tracing and correlation ids to
  localize the failing service, prefer local reproduction via
  Testcontainers over poking a live environment, and report root cause
  separately from the minimal fix. Use whenever a test fails unexpectedly,
  a stack trace needs investigation, or observed behavior diverges from
  expectation.
metadata:
  layer: practice
---

## When to use this

Something is broken and the cause isn't obvious yet: a failing test, a
production incident, an intermittent stack trace, behavior that diverges
from spec. Not for implementing a feature or for a known-cause fix where
the change is already clear — that's regular implementation work.

## Conventions

- **Reproduce before diagnosing.** State the exact reproduction (failing
  test name, request/payload, or steps) before forming a hypothesis about
  cause. A root-cause claim with no reproduction attached is a guess, not
  a diagnosis — treat it as unverified until a test or command proves it.
- **Localize using the correlation id.** Every request/event carries a
  correlation id propagated through MDC and across service/Kafka
  boundaries (see `spring-boot`/`kafka` skills). Start any cross-service
  investigation by pulling every log line for that id across the
  services in the call path, in trace order, before guessing which
  service is at fault.
  <!-- CUSTOMIZE: name the actual log aggregation / tracing backend used
  here, e.g. Grafana Loki + Tempo, Datadog, ELK — and how to query by
  correlation id in it -->
- **Prefer local reproduction over poking a live environment.** If the
  bug can be reproduced with a failing unit/integration test using
  Testcontainers (see `testing` skill), do that before attaching a
  debugger to a shared environment — it's reproducible, shareable in a
  PR, and becomes the regression test once fixed.
- **Isolate with the narrowest failing test you can write**, cutting away
  unrelated code until the smallest input that reproduces the fault is
  known. This is usually more valuable than reading the full stack trace
  top to bottom.
- **Report root cause and minimal fix as two separate statements.** The
  root cause explains *why* the fault happens; the minimal fix is the
  smallest change that resolves it. They are reported separately so
  whoever owns the decision can choose to apply the minimal fix now and
  file a larger fix separately, rather than getting a fix bundled with
  unrequested refactoring.
- **Don't fix what you didn't diagnose.** If the investigation surfaces a
  second, unrelated issue, name it and stop — do not silently expand
  scope to fix it as part of the same investigation.

## Patterns to follow

- For a flaky test: run it in isolation and repeated (`--rerun` /
  a loop) before touching code, to confirm it's actually flaky and not a
  one-off environment issue.
  ```bash
  for i in $(seq 1 20); do ./gradlew test --tests '*OrderServiceTest' || break; done
  ```
- For a stuck/wedged JVM (virtual-thread deadlock, pool exhaustion): pull a
  thread dump before restarting the process — a restart without one
  destroys the only evidence.
  ```bash
  kubectl -n <ns> exec <pod> -- jcmd 1 Thread.Print > thread-dump.txt
  ```
- For a suspected memory issue: a heap histogram is cheaper than a full
  heap dump and usually enough to confirm/deny the hypothesis first.
  ```bash
  kubectl -n <ns> exec <pod> -- jcmd 1 GC.class_histogram | head -30
  ```

## Common mistakes

- Proposing a fix before writing down the exact reproduction — this
  produces fixes for the wrong bug more often than it looks like it
  should.
- Debugging directly against a shared/live environment when the fault is
  reproducible locally with Testcontainers, which is slower and riskier
  (shared state, other engineers' traffic) than a local repro.
- Restarting a wedged pod before capturing a thread/heap dump, destroying
  the evidence needed to actually diagnose it.
- Bundling an unrelated cleanup or refactor into the "minimal fix" for a
  bug — report the extra finding separately instead.
- Reading only the service that threw the exception, when the correlation
  id shows the actual fault originated upstream.

## How to verify

```bash
# Confirm the reproduction: this should fail before the fix, pass after
./gradlew test --tests '*<FailingTestName>'

# Confirm the fix doesn't break the surrounding suite
./gradlew :<module>:check

# Pull all logs for a correlation id across a namespace (adjust to your
# log backend)
kubectl -n <ns> logs -l app.kubernetes.io/name=<service> --since=1h | grep '<correlationId>'
```
