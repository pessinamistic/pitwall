---
name: redis
description: >-
  Conventions for Redis usage in this stack — approved use cases, key
  naming and TTL discipline, cache-aside pattern, serialization, and
  distributed locking. Use whenever adding a cache, a rate limiter, a
  distributed lock, or any code that touches a `RedisTemplate` or reactive
  Redis client.
metadata:
  layer: datastore
---

## When to use this

Adding a cache layer, a distributed lock, a rate limiter, or any
short-lived shared state that multiple service instances need to see.
Also read this before adding a new key pattern to an existing cache.

## Conventions

- **Redis is never the system of record.** Every key must be reconstructible
  from Postgres, Mongo, or a Kafka topic. If losing the entire Redis
  instance would lose data permanently, that data does not belong in Redis
  — see the `postgres`/`mongodb` placement rules.
- **Approved use cases only:** cache-aside for expensive reads, distributed
  locks (via Redisson or `SET NX PX`), rate limiting counters, and
  short-lived session/state tokens. Not a message queue (use Kafka), not a
  primary datastore.
- **Every key has a TTL.** No key is written without an explicit expiry —
  unbounded key growth from a "just cache it" decision is the most common
  Redis incident in this kind of stack. Default TTL is 10 minutes for
  read-through caches unless the data's staleness tolerance says otherwise.
- **Key naming:** `<service>:<entity>:<id>[:<field>]`, colon-delimited,
  lowercase, e.g. `orders-service:order:summary:<orderId>`. This makes key
  scans and `SCAN`-based debugging predictable across services sharing a
  cluster.
  <!-- CUSTOMIZE: replace `orders-service` with the real service-name
  prefix convention if it differs, and confirm the shared-cluster vs
  cluster-per-service topology -->
- **Cache-aside, not write-through.** The application writes to Postgres/Mongo
  first, then invalidates (not updates) the cache key — let the next read
  repopulate it. Never let cache-write logic become a second source of
  truth that can drift from the database.
- **Serialization is JSON via Jackson**, matching the API DTO shape where
  possible, with the cached payload's shape versioned in the key
  (`...:v2:...`) so a deploy that changes the cached shape doesn't
  deserialize stale-shaped JSON into a broken object.
- **Distributed locks use Redisson's `RLock`** with a lease time and are
  always released in a `finally` block; never hold a lock across an
  outbound network call to another service.
- **Connection via Lettuce** (Spring Boot's default), pooled, with a
  circuit breaker/timeout wrapping cache reads so a slow or down Redis
  degrades to "skip cache, hit the DB" rather than failing the request.

## Patterns to follow

```java
Optional<OrderSummary> cached = cache.get(key, OrderSummary.class);
if (cached.isPresent()) {
    return cached.get();
}
OrderSummary fresh = loadFromDatabase(orderId);
cache.set(key, fresh, Duration.ofMinutes(10));
return fresh;
```
- Invalidate on write: after the DB transaction commits, delete the
  affected cache key(s) rather than trying to compute and push the new
  value into the cache from inside the write path.
- Wrap every cache read in a fallback: cache miss or Redis error both fall
  through to the database, they are not distinguished by the caller.

## Common mistakes

- Writing a key with no TTL "temporarily" — this is how caches turn into
  unbounded memory growth in production.
- Using Redis as the only place a piece of state lives (e.g. a shopping
  cart with no DB backing) — an eviction or restart then loses user data.
- Holding a distributed lock across a call to another service's API,
  turning a local contention problem into a cross-service outage risk.
- Updating a cached value directly on write instead of invalidating it,
  which drifts from the database the first time a write path is missed.
- Sharing one key namespace across two services without the `<service>:`
  prefix, causing accidental key collisions.

## How to verify

```bash
# Unit test cache-aside logic with an embedded/mocked cache
./gradlew test --tests '*OrderSummaryCacheTest'

# Integration test against a real Redis via Testcontainers
./gradlew test --tests '*OrderSummaryCacheIntegrationTest'

# Inspect keys and TTLs for a service's namespace locally
redis-cli --scan --pattern 'orders-service:*' | xargs -I{} redis-cli TTL {}

# Confirm no key was written without a TTL (any -1 here is a bug)
redis-cli --scan --pattern 'orders-service:*' | xargs -I{} redis-cli TTL {} | grep -c '^-1$'
```
