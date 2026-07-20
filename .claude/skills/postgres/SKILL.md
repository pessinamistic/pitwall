---
name: postgres
description: >-
  Conventions for PostgreSQL usage in this stack — which data belongs here
  versus MongoDB, migration discipline, naming and schema conventions,
  transaction boundaries, indexing, and connection pooling. Use whenever
  designing a table, writing a migration, adding a repository query, or
  deciding whether new data should live in Postgres at all.
metadata:
  layer: datastore
---

## When to use this

Designing a new table or migration, writing a JPA repository/query, or
deciding where a new piece of data should be stored. Read this alongside
`mongodb` — the two skills together define the routing rule this stack
uses to keep data placement consistent across services.

## Data placement rule (read this first)

**Postgres owns relational, transactional, and reporting data:** anything
with a fixed schema, referential integrity requirements (foreign keys,
uniqueness constraints), multi-row ACID transactions, or that gets joined
across entities for reporting/analytics. Orders, payments, accounts,
inventory counts, anything with a monetary amount, and anything a BI tool
queries directly — all Postgres.

**Route to MongoDB instead** (see `mongodb` skill) when the data is
document-shaped with a schema that varies per record or evolves fast,
or is high-write append-mostly event/log data that isn't joined
relationally. When in doubt: if you'd reach for a `JOIN` or a `SUM()`
across many rows, it's Postgres; if you'd store a blob of nested JSON with
no fixed shape, it's Mongo.

## Conventions

- **Migrations are the only way schema changes happen**, via Flyway
  (`src/main/resources/db/migration/V<n>__<description>.sql`), checked into
  the same PR as the code that needs them. No hand-run DDL against any
  environment, ever — including "just this once" in prod.
  <!-- CUSTOMIZE: if this org standardizes on Liquibase instead, swap the
  tool name and file convention here -->
- **One schema (database) per service.** No service reads or writes another
  service's tables directly, and no cross-service foreign keys — if
  service B needs data service A owns, it calls A's API or consumes A's
  Kafka events, it does not join across schemas.
- **Naming:** `snake_case` for tables and columns, plural table names
  (`orders`, `order_lines`). Every table has a `id UUID PRIMARY KEY DEFAULT
  gen_random_uuid()`, plus `created_at timestamptz NOT NULL DEFAULT now()`
  and `updated_at timestamptz NOT NULL DEFAULT now()` maintained by a
  trigger, not by application code.
- **Soft delete via `deleted_at timestamptz NULL`** for anything with a
  retention or audit requirement; hard `DELETE` only for data with no such
  requirement. Every query against a soft-deletable table filters
  `deleted_at IS NULL` — this is enforced via a Hibernate `@SQLRestriction`
  / `@Where`, not remembered per-query.
- **Every foreign key has an index.** Postgres does not create one
  automatically, and a missing FK index is the single most common cause of
  a slow join in this stack — check for it in every migration review.
- **Connection pooling via HikariCP**, pool size set from the formula
  `connections = ((core_count * 2) + effective_spindle_count)` per
  instance, not a round-number guess — and always well under the DB's
  `max_connections` once multiplied by expected replica/pod count.
- **Read replicas serve reporting/analytics queries**; the primary is
  reserved for transactional traffic. A query that scans a large table for
  a dashboard does not run against the primary.
  <!-- CUSTOMIZE: name the actual replica connection/datasource bean used
  for reporting queries in this stack -->

## Patterns to follow

- Every migration is backward-compatible with the currently-deployed
  application version (additive columns as nullable or with a default;
  drop a column only after the code referencing it has been removed and
  deployed).
- Multi-row invariants (e.g. "total of order lines equals order total")
  are enforced inside a single `@Transactional` service method, not spread
  across multiple calls that could interleave.
- Use `EXPLAIN (ANALYZE, BUFFERS)` on any query touching a table expected
  to grow past ~100k rows before merging it.

## Common mistakes

- Adding a `NOT NULL` column with no default in a migration that runs
  against a table with existing rows — this locks the table and fails on
  large tables; add nullable, backfill, then constrain in a follow-up
  migration.
- Forgetting the FK index, then "fixing" a slow endpoint months later
  instead of catching it in migration review.
- Letting a reporting query run against the primary connection pool and
  starving transactional traffic.
- Storing genuinely flexible/schemaless JSON in a Postgres `jsonb` column
  because "it's easier" when the data is actually a good fit for Mongo per
  the placement rule above — this is the most common inconsistency between
  services in practice.

## How to verify

```bash
# Apply migrations against a local/dev database and confirm they're clean
./gradlew flywayMigrate -i

# Confirm migration checksums match what's committed (catches hand-edits)
./gradlew flywayValidate

# Repository/query test against a real Postgres via Testcontainers
./gradlew test --tests '*OrderRepositoryTest'

# Check a new query's plan before merging
psql "$DATABASE_URL" -c "EXPLAIN (ANALYZE, BUFFERS) SELECT ..."
```
