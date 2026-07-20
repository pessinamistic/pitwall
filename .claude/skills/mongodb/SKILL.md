---
name: mongodb
description: >-
  Conventions for MongoDB usage in this stack — which data belongs here
  versus Postgres, document/schema versioning, id strategy, indexing via
  migrations, and transaction-avoidance patterns. Use whenever designing a
  collection, writing a repository query, or deciding whether new data
  should live in Mongo at all.
metadata:
  layer: datastore
---

## When to use this

Designing a new collection, writing a Spring Data Mongo repository/query,
or deciding where a new piece of data should be stored. Read alongside
`postgres` — together they define this stack's data-placement rule.

## Data placement rule (read this first)

**MongoDB owns document-shaped, flexible/evolving-schema data, and
high-write event or log-shaped data that isn't relationally joined:**
audit logs, activity feeds, denormalized read models built from Kafka
events, per-tenant configuration blobs with varying shape, search-adjacent
documents, anything where different records legitimately have different
fields.

**Route to Postgres instead** (see `postgres` skill) when the data has a
fixed relational schema, needs multi-row ACID transactions or foreign-key
integrity, or is queried by joining/aggregating across entities for
reporting. When in doubt: if the shape is the same for every record and
you need strong consistency across tables, it's Postgres; if the shape
varies or it's an append-mostly stream of documents, it's Mongo.

## Conventions

- **Every document has an explicit `_schemaVersion: int` field.** Readers
  branch on this to handle old-shape documents rather than assuming every
  document in a collection matches the current POJO/record — Mongo has no
  schema enforcement, so the application is the only thing that knows a
  migration happened.
- **IDs are UUIDs stored as strings** (`_id: "<uuid>"`), not Mongo's default
  `ObjectId`, whenever the id is referenced from another service (e.g. in a
  Kafka event or an API response) — `ObjectId` leaks Mongo as an
  implementation detail and is awkward to pass around outside the driver.
  Pure-internal, never-externalized documents may use `ObjectId`.
- **Avoid multi-document transactions.** Model writes so a single document
  update is atomic (embed what's written together, write together); reach
  for a Mongo multi-document transaction only when there is truly no way to
  express the invariant as a single-document write, since transactions
  across shards add real latency and operational risk here.
- **Indexes are defined in migration scripts** (Mongock), checked into the
  same PR as the code that needs them — never created ad hoc against a
  live cluster. Every query path used in production has a supporting index;
  check with `.explain()` before merging a new query.
- **TTL indexes for anything genuinely ephemeral** (e.g. session-adjacent
  documents, short-lived caches expressed as documents) instead of a
  manual cleanup job.
- **Connection string and credentials come from the secret store**, never
  committed to `application.yml` in plaintext.
  <!-- CUSTOMIZE: name the actual secret source and the cluster's real
  connection URI pattern, e.g. mongodb+srv://<cluster>.acme.example -->
- **One database per service** (or a clearly namespaced collection prefix
  within a shared cluster), matching the Postgres "no cross-service schema
  reads" rule — no service queries another service's collections directly.
  <!-- CUSTOMIZE: state whether this org runs one Mongo cluster shared by
  namespace, or a cluster per service -->

## Patterns to follow

- Read models built from Kafka events (see `kafka` skill) are upserted
  idempotently keyed on the event's business id, so replaying events (a
  rebalance, a reprocessing job) is safe and doesn't duplicate documents.
- Repository queries use Spring Data Mongo's derived query methods or
  `@Aggregation` pipelines defined alongside the repository interface, not
  raw `MongoTemplate` calls scattered through service classes.
- Large/growing arrays inside a document (e.g. "all events for this
  order") are capped or moved to a separate collection once they threaten
  the 16MB document limit — decide this at design time, not when it breaks.

## Common mistakes

- Treating a Mongo collection as a relational table and reaching for a
  multi-document transaction to enforce an invariant that could have been
  a single-document write with better modeling.
- Skipping `_schemaVersion` and then breaking every reader the first time
  a field is renamed.
- Using `ObjectId` for an id that later needs to be embedded in a Kafka
  event or returned from a public API.
- Letting an unbounded array field grow inside a single document instead
  of splitting it out before it becomes an operational incident.
- Storing what's actually reporting/join-heavy relational data in Mongo
  because a document felt convenient to write — check the placement rule
  above before defaulting to Mongo for new data.

## How to verify

```bash
# Apply Mongock migrations locally/in CI
./gradlew mongockMigrate

# Repository/query test against a real Mongo via Testcontainers
./gradlew test --tests '*OrderReadModelRepositoryTest'

# Confirm a query uses the intended index rather than a collection scan
mongosh "$MONGO_URI" --eval 'db.orders.find({customerId: "..."}).explain("executionStats")'
```
