---
name: java
description: >-
  Conventions for Java 21 code in this stack — language feature policy
  (records, sealed types, pattern matching, virtual threads), null and
  Optional discipline, exception design, dependency and build conventions,
  and formatting/static analysis gates. Use whenever writing or reviewing
  any Java source file, choosing between a class/record/sealed hierarchy,
  or deciding how a method should signal failure.
metadata:
  layer: language
---

## When to use this

Any time you touch a `.java` file: writing new classes, refactoring, choosing
a data-modeling shape, or reviewing a diff for idiom violations. Also load
this before `spring-boot`, since Spring conventions build on top of these.

## Conventions

- **Target: Java 21, preview features off.** Use records for immutable data
  carriers, sealed interfaces + pattern matching (`switch` with `when`
  guards) for closed hierarchies (e.g. domain events, result types). Do not
  use Lombok on new code — records and Java's own accessors replace most of
  its use cases; `@Builder`-style construction is done with a plain static
  factory or a hand-written builder when a record has more than ~4 fields.
- **Virtual threads are the default concurrency model** for I/O-bound work
  (`Executors.newVirtualThreadPerTaskExecutor()`), not platform-thread pools
  or reactive types. Do not introduce Project Reactor / WebFlux in a service
  that doesn't already use it solely to get concurrency — virtual threads
  get the same throughput with blocking, debuggable code.
- **No `null` in method signatures you own.** Return `Optional<T>` from
  finder-style methods that may legitimately find nothing; throw a typed
  exception for "should never happen" cases. Never use `Optional` as a field
  type or method parameter type — it's a return-type-only tool.
- **Checked exceptions are not used for new APIs.** Define unchecked
  domain exceptions extending a small shared hierarchy (e.g.
  `DomainException` → `NotFoundException`, `ConflictException`,
  `ValidationException`) that the Spring layer maps to HTTP statuses (see
  `spring-boot` skill). Never catch `Exception` broadly and swallow it —
  catch the specific type or let it propagate.
- **Package by feature, not by layer.** `com.acme.orders.create`,
  `com.acme.orders.query`, not a top-level `controllers/`, `services/`,
  `repositories/` split. Shared cross-feature code lives in `.../orders/common`.
  <!-- CUSTOMIZE: replace com.acme with your org's real base package / groupId -->
- **Build tool: Gradle (Kotlin DSL), with a version catalog** at
  `gradle/libs.versions.toml` — no hardcoded version strings in build files.
  Internal libraries are published to a private artifact repository.
  <!-- CUSTOMIZE: set the internal Maven/Gradle repo URL and groupId prefix
  used to publish and consume shared internal libraries -->
- **Formatting is enforced by Spotless** (google-java-format), not left to
  taste. Static analysis via Error Prone + NullAway run as part of
  `compileJava`, not as an optional lint step.

## Patterns to follow

- Domain events and API results as sealed interfaces:
  ```java
  public sealed interface OrderResult permits OrderResult.Created, OrderResult.Rejected {
      record Created(UUID orderId, Instant at) implements OrderResult {}
      record Rejected(String reason) implements OrderResult {}
  }
  ```
- Finder methods: `Optional<Order> findById(UUID id)`, never `Order findByIdOrNull`.
- Structured logging via SLF4J with parameterized messages and MDC context,
  never string concatenation: `log.info("order {} created for customer {}", orderId, customerId);`
- Use `var` for local variables whose type is obvious from the right-hand
  side; keep explicit types on public method signatures and fields.

## Common mistakes

- Reaching for Lombok `@Data`/`@Builder` instead of a record — flag this in
  review, it reintroduces mutability and equals/hashCode bugs records solve.
- Using `Optional.get()` without `isPresent()`/`orElseThrow` — always pair
  with `orElseThrow(() -> new NotFoundException(...))`.
- Mixing platform-thread pools (`Executors.newFixedThreadPool`) into new
  I/O-bound code instead of the virtual-thread executor.
- Catching `RuntimeException` at a service boundary to "be safe" — this
  hides bugs from the global exception handler and from tests.
- Committing code that fails `./gradlew spotlessCheck` — always run
  `spotlessApply` before committing, not after CI flags it.

## How to verify

```bash
# Compile + static analysis (Error Prone/NullAway run as part of this)
./gradlew compileJava compileTestJava

# Formatting gate — must pass with zero diffs
./gradlew spotlessCheck

# Full verification for a module you touched
./gradlew :orders-service:check

# Fix formatting violations before committing
./gradlew spotlessApply
```
