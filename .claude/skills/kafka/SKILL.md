---
name: kafka
description: >-
  Conventions for producing and consuming Kafka events in this stack —
  topic naming, idempotent consumers, retry and DLQ wiring, serialization
  and schema registry, partition key selection, and how to test consumers.
  Use whenever writing or reviewing producer/consumer code, adding a topic,
  or debugging message flow.
metadata:
  layer: messaging
---

## When to use this

Adding or changing a Kafka producer/consumer, introducing a new topic,
changing an event schema, or diagnosing a message-flow / consumer-lag
incident.

## Conventions

- **Topic naming:** `<org>.<domain>.<event-name>.v<n>`, all lowercase,
  dot-separated, e.g. `acme.orders.order-created.v1`. The version suffix
  bumps only on a breaking schema change; additive fields do not bump it.
  <!-- CUSTOMIZE: replace `acme` with your org's real topic prefix -->
- **Consumers must be idempotent.** Kafka's at-least-once delivery means
  every consumer will see duplicates during rebalances/retries. Dedupe by
  the event's business key (e.g. `orderId` + `eventType`) against a
  processed-ids table or an upsert that's naturally idempotent (e.g.
  `INSERT ... ON CONFLICT DO NOTHING` / a Mongo upsert keyed on the event
  id). Never assume "consumed once" ordering guarantees correctness.
- **Retries use Spring Kafka's non-blocking retry topics**
  (`@RetryableTopic`), not an in-process retry loop that blocks the
  partition. Configure exponential backoff (e.g. 1s → 2s → 4s, 3 attempts)
  and route to a `<topic>.dlt` after exhaustion. The DLQ is monitored —
  landing a message there pages someone, it is not a silent trash can.
  <!-- CUSTOMIZE: point at the actual alert/runbook for DLQ messages -->
- **Serialization is Avro via a schema registry.** Every topic has a
  registered schema; producers use `BACKWARD` compatibility mode so old
  consumers keep working through a rollout. Never produce raw JSON to a
  topic another team consumes.
  <!-- CUSTOMIZE: set the schema registry URL, e.g.
  https://schema-registry.internal.acme.example:8081 -->
- **Partition key = the aggregate/entity id** the event is about (e.g.
  `orderId`), never a random key and never the event id. This guarantees
  all events for one entity land on the same partition and are processed
  in order relative to each other — that ordering guarantee is the whole
  reason to pick a key deliberately.
- **One consumer group per logical service**, named
  `<service-name>-<topic-short-name>`, not per-instance. Never share a
  consumer group across two unrelated services — it silently splits the
  partition assignment between them.
- **Producers set `acks=all`** and enable idempotent producing
  (`enable.idempotence=true`, the Spring Kafka default in recent versions)
  so retried sends don't double-publish.

## Patterns to follow

- Consumer method signature takes the deserialized Avro-generated type
  plus the `ConsumerRecord` metadata when the offset/partition is needed
  for logging, not a raw `String`/`byte[]` that gets manually parsed.
- Outbox pattern for events that must be published atomically with a DB
  write: write the event row in the same transaction as the business
  change, publish it via a separate poller (Debezium or a scheduled
  publisher), rather than calling `kafkaTemplate.send()` inside the
  `@Transactional` method (a send can succeed while the DB transaction
  later rolls back, or vice versa).
- Log the correlation id (see `spring-boot` skill) from the consumed
  event's headers into MDC before processing, so downstream logs join up
  with the producer's trace.

## Common mistakes

- Treating `@KafkaListener` as "will only ever see a message once" and
  writing a plain `INSERT` instead of an idempotent upsert.
- Blocking retry with `Thread.sleep` + manual re-poll inside a listener —
  this stalls the whole partition and causes rebalance storms under load.
- Random or round-robin partition keys "for load balancing" — this breaks
  per-entity ordering, which is almost always required.
- Bumping a schema's field type or removing a field without a compatibility
  check against the schema registry first.
- Consuming and processing in the same method without separating
  "deserialize" from "business logic," which makes unit testing the logic
  without a broker unnecessarily hard.

## How to verify

```bash
# Unit test the consumer's business logic in isolation
./gradlew test --tests '*OrderCreatedConsumerTest'

# Integration test against a real broker + schema registry via Testcontainers
./gradlew test --tests '*OrderCreatedConsumerIntegrationTest'

# Confirm schema compatibility before pushing a schema change
# (adjust registry URL per environment)
curl -s -X POST -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  --data @src/main/avro/order-created.avsc \
  http://localhost:8081/compatibility/subjects/acme.orders.order-created.v1-value/versions/latest

# Watch consumer group lag locally after a change
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --describe --group orders-service-order-created
```
