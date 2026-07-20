---
name: spring-boot
description: >-
  Conventions for Spring Boot 3.x services in this stack — layering and
  DTO/entity separation, dependency injection style, configuration and
  profile management, exception-to-HTTP mapping, validation, API
  versioning, observability wiring, and inter-service auth. Use whenever
  writing or reviewing a controller, service, configuration class, or
  anything under `src/main/resources/application*.yml`.
metadata:
  layer: framework
---

## When to use this

Any work inside a Spring Boot service: new endpoints, new
`@Configuration`/`@ConfigurationProperties` classes, changes to
`application.yml`, or wiring a new bean. Assumes the `java` skill's language
conventions.

## Conventions

- **Constructor injection only.** No `@Autowired` on fields, no field
  injection, no setter injection. Every Spring-managed class takes its
  dependencies as `final` constructor parameters (with Lombok `@RequiredArgsConstructor`
  banned per the `java` skill — write the constructor, or let a record-based
  component do it implicitly).
- **Strict layering:** `controller` (HTTP concerns only, no business logic)
  → `service` (business logic, transaction boundaries) → `repository`
  (Spring Data interfaces only). Controllers depend on service interfaces,
  never directly on repositories.
- **DTOs are never entities.** Request/response DTOs are separate records
  in a `.dto` subpackage; mapping to/from JPA or Mongo entities happens in
  an explicit mapper class (hand-written or MapStruct), never by exposing
  `@Entity` classes through Jackson.
- **Validation via `jakarta.validation`** annotations on request DTOs
  (`@NotNull`, `@Valid` on controller params). Cross-field or business-rule
  validation belongs in the service layer as explicit checks that throw the
  domain exceptions defined in the `java` skill.
- **Exceptions map to HTTP via one `@RestControllerAdvice`** per service,
  translating the shared domain exception hierarchy to status codes
  (`NotFoundException` → 404, `ConflictException` → 409,
  `ValidationException` → 400). Controllers never catch exceptions to build
  error responses by hand.
- **Configuration is typed**, via `@ConfigurationProperties` records bound
  from `application.yml`, not scattered `@Value("${...}")` injections.
  Profiles: `application.yml` (defaults) + `application-{local,test,prod}.yml`
  for overrides. Secrets are never in any `application*.yml` — they come
  from the deployment's secret store.
  <!-- CUSTOMIZE: name the actual secret source (Vault, AWS Secrets Manager,
  k8s External Secrets) your services pull from at startup -->
- **Actuator is on** with `health`, `info`, `prometheus` exposed; readiness
  and liveness are split health groups (`management.endpoint.health.probes.enabled=true`)
  so Kubernetes probes (see `kubernetes` skill) don't conflate "DB down" with
  "process wedged."
- **API versioning is in the URL path** (`/api/v1/orders`), not headers.
  Breaking changes get a new version segment; the old one stays live until
  every known consumer has migrated.
- **Correlation IDs propagate automatically**: an incoming
  `X-Correlation-Id` (or generated one) is put in MDC by a filter and
  forwarded on every outbound `RestClient`/`WebClient`/Kafka call, so logs
  and traces join up across services.
- **Service-to-service calls carry the caller's identity**, propagated as a
  signed JWT or mTLS client cert — never trust an unauthenticated internal
  call just because it's inside the cluster network.
  <!-- CUSTOMIZE: name the actual internal-auth mechanism (JWT issuer,
  mTLS via service mesh, etc.) used between your services -->

## Patterns to follow

- Use `RestClient` (Spring 6.1+) for outbound HTTP, not `RestTemplate`
  (deprecated posture) and not `WebClient` unless the call site is already
  reactive.
- Transaction boundaries are declared at the service method, not the
  repository: `@Transactional` on the service method that must be atomic,
  with the narrowest scope that includes all writes.
- Bean validation groups for create-vs-update DTOs when the same shape
  needs different required fields, instead of two near-duplicate DTOs.

## Common mistakes

- Returning a JPA/Mongo `@Entity` (or a Spring Data `Page<Entity>`) straight
  from a controller — always map to a DTO first, even when they look
  identical today.
- Putting `@Transactional` on a controller method or on a method that also
  makes outbound HTTP/Kafka calls (an open transaction around remote I/O
  holds a DB connection for the whole round trip).
- Field-level `@Autowired` sneaking into new code — reject in review.
- Catching a domain exception in the controller layer just to build a
  custom error body — that logic belongs in the `@RestControllerAdvice`.
- Reading secrets via `@Value("${some.password}")` pointed at a plaintext
  property in `application.yml`.

## How to verify

```bash
# Slice test for a single controller (no full context)
./gradlew test --tests '*OrderControllerTest'

# Full context integration test for a service
./gradlew test --tests '*OrderServiceIntegrationTest'

# Confirm actuator health groups are wired correctly against a local build
./gradlew bootRun &
curl -sf localhost:8080/actuator/health/readiness
curl -sf localhost:8080/actuator/health/liveness

# Whole-module verification
./gradlew :orders-service:check
```
