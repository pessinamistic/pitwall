---
name: elasticsearch
description: >-
  Conventions for Elasticsearch usage in this stack — its role as a
  derived, rebuildable search index rather than a system of record, index
  naming with aliases for zero-downtime reindexing, mapping discipline,
  event-driven indexing, and query-builder structure. Use whenever adding
  a search endpoint, changing a mapping, or wiring an indexer off Kafka.
metadata:
  layer: datastore
---

## When to use this

Adding a search or filtering endpoint backed by Elasticsearch, changing an
index mapping, or wiring a consumer that indexes documents from Kafka
events. Read alongside `postgres`/`mongodb` — ES is never where data
originates.

## Conventions

- **Elasticsearch is a derived read index, never the source of truth.**
  Every document indexed must be reconstructible from Postgres or Mongo (or
  replayable from Kafka). If the ES cluster were deleted, a full reindex
  from the canonical store must be able to rebuild it exactly — design the
  indexer with that requirement in mind from day one, not as an
  afterthought.
- **Index naming uses an alias + versioned backing index**:
  `orders-search-v1` (backing index) behind the alias `orders-search`
  that the application actually queries and writes through. Reindexing for
  a mapping change means creating `orders-search-v2`, backfilling it, then
  atomically swapping the alias — never mutating a mapping in place on a
  live index.
  <!-- CUSTOMIZE: replace `orders-search` with the real per-domain index
  naming scheme and confirm the cluster endpoint / hosting (self-managed
  vs Elastic Cloud vs AWS OpenSearch) -->
- **Mappings are explicit, `dynamic: strict` in production.** No field is
  allowed to be created implicitly by whatever the first document happens
  to contain — every field is declared with its intended type and analyzer
  up front, checked into the same repo as the indexer code.
- **Indexing is event-driven off Kafka**, consuming the same domain events
  the rest of the stack does (see `kafka` skill) and upserting idempotently
  keyed on the entity id — never a synchronous dual-write from the request
  path that writes to Postgres and ES in the same call (that's a
  consistency and latency problem in one).
- **Query DSL lives in dedicated query-builder classes** (one per search
  use case), not inline JSON strings or ad hoc `NativeQuery` construction
  scattered through controllers — this keeps queries reviewable and
  testable independent of the HTTP layer.
- **Full reindex is a scripted, idempotent job**, runnable on demand
  against a fresh backing index, and is the documented recovery path for
  "the index and the source of truth have drifted" — not a manual
  document-by-document fix.

## Patterns to follow

- Read model documents mirror the shape needed for search/filter/sort, not
  the full entity — don't index fields nothing ever queries or sorts on.
- Bulk-index in batches via the `_bulk` API from the Kafka consumer's
  batch listener, not one `index()` call per event, to keep indexing
  throughput ahead of topic lag.
- Version the document schema the same way Mongo documents are versioned
  (`schemaVersion` field) so an in-flight reindex and a mapping change can
  coexist briefly during a rollout.

## Common mistakes

- Querying Elasticsearch for data that must be strongly consistent right
  after a write (e.g. "show the order I just placed") — that read goes to
  Postgres/Mongo directly; ES indexing lags by design.
- Changing a mapping in place on the live index instead of going through
  the alias-swap reindex process, which silently breaks queries or forces
  Elasticsearch to reject writes.
- Letting `dynamic` mapping stay on in a non-prod environment and then
  discovering prod rejects a field that "worked in dev."
- Writing to Elasticsearch synchronously inside the same request that
  writes to the primary datastore, coupling request latency to ES health.
- Building queries as hand-assembled JSON strings instead of the
  query-builder classes, making them unreviewable and untestable.

## How to verify

```bash
# Unit test a query-builder in isolation (no cluster needed)
./gradlew test --tests '*OrderSearchQueryBuilderTest'

# Integration test against a real cluster via Testcontainers
./gradlew test --tests '*OrderSearchIndexerIntegrationTest'

# Confirm the alias points at the expected backing index
curl -s localhost:9200/_alias/orders-search | jq

# Validate a mapping change against a scratch index before the real reindex
curl -s -X PUT localhost:9200/orders-search-v2 -H 'Content-Type: application/json' \
  -d @src/main/resources/es/orders-search-mapping.json
```
