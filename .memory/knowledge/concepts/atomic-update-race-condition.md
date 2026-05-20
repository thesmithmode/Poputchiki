---
title: "Atomic UPDATE with WHERE-Guard — Race Condition in Seat/Passenger Counts"
aliases: [atomic-update, join-trip-race, passengers-count-race, where-guard-update, for-update-race]
tags: [database, postgresql, concurrency, gotcha, critical]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# Atomic UPDATE with WHERE-Guard — Race Condition in Seat/Passenger Counts

When checking a count limit (seats available, passenger cap) and then updating the counter in two separate SQL statements without `SELECT ... FOR UPDATE`, concurrent requests both pass the check before either writes, resulting in overbooking. The fix is a single atomic `UPDATE ... WHERE counter < limit RETURNING id` that serves as both the check and the increment.

## Key Points

- Two-step check-then-act: `SELECT passengers_count < max_passengers` + `UPDATE passengers_count + 1` — both steps succeed concurrently → overbooking
- Fix: one atomic `UPDATE trips SET passengers_count = passengers_count + 1 WHERE id = $1 AND passengers_count < max_passengers RETURNING id`
- If `RETURNING` yields 0 rows → capacity full or concurrent update won — return 409 Conflict to the caller
- Same pattern applies to `book_seat()`, ride capacity checks, and any counter with an upper bound
- A UNIQUE partial index on `(driver_id) WHERE status IN ('active','started')` prevents concurrent duplicate active-trip creation at the schema level

## Details

The concurrent booking race condition is a classic check-then-act failure. Both requests arrive at the same millisecond:

```
Request A: SELECT passengers_count=3, max_passengers=4 → 3 < 4 → OK
Request B: SELECT passengers_count=3, max_passengers=4 → 3 < 4 → OK
Request A: UPDATE SET passengers_count = 4
Request B: UPDATE SET passengers_count = 5  ← OVERBOOKING
```

Both requests read `3` before either writes. Both pass the `3 < 4` check. Both increment. The result is `5`, exceeding the cap of `4`.

The atomic WHERE-guard pattern collapses the check and increment into one statement:

```sql
-- Atomic: check AND increment in one statement
UPDATE trips
SET passengers_count = passengers_count + 1
WHERE id = $1
  AND passengers_count < max_passengers
RETURNING id;
```

PostgreSQL takes a row-level lock when executing the UPDATE. The second concurrent request must wait for the first to commit before it can attempt its UPDATE. After the first request commits (`passengers_count = 4`), the second request evaluates `4 < 4` → false → 0 rows returned → 409 Conflict to the caller.

**Application layer:**

```typescript
const [result] = await sql`
  UPDATE trips
  SET passengers_count = passengers_count + 1
  WHERE id = ${tripId}
    AND passengers_count < max_passengers
  RETURNING id
`;

if (!result) {
  return c.json({ error: "Поездка заполнена" }, 409);
}
```

This pattern requires no explicit `BEGIN`/`FOR UPDATE`/`COMMIT` — the single-statement UPDATE is implicitly atomic.

**UNIQUE partial index for duplicate active trips:**

```sql
CREATE UNIQUE INDEX trips_driver_active_uniq
  ON trips(driver_id)
  WHERE status IN ('active', 'started');
```

This prevents two concurrent `INSERT INTO trips` (with the same `driver_id`) from both succeeding when the driver already has an active trip. The unique constraint enforces the invariant at the schema level, making application-layer duplicate checks a defensive redundancy rather than the sole gate.

**Relationship to existing `book_seat()` bug:** The 2026-05-17 fix moved `book_seat()` to the accept step rather than the request step (see [[concepts/book-seat-on-accept-not-request]]). The atomic UPDATE pattern is the correct implementation of `book_seat()` itself — the timing fix and the atomicity fix are independent concerns that must both be applied.

## Related Concepts

- [[concepts/book-seat-on-accept-not-request]] — When to call the seat-booking function; this article covers how to implement it correctly (atomically)
- [[concepts/on-conflict-constraint-pitfall]] — Related concurrency pattern: `ON CONFLICT DO NOTHING` without a constraint; both require schema-level enforcement of uniqueness
- [[concepts/advisory-lock-pool-safety]] — Advisory locks are an alternative approach to preventing concurrent seat booking; atomic UPDATE is simpler when the guard condition fits in a WHERE clause

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-db-review finding #1 CRITICAL: joinTrip race condition — check `passengers_count < max_passengers` and `UPDATE ... + 1` in separate SQL without `FOR UPDATE` → concurrent requests both pass → overbooking; sector-api-review finding #3: same race, also trips active duplicate; fix: atomic `UPDATE ... WHERE ... < max RETURNING id` + UNIQUE partial index on `(driver_id) WHERE status IN ('active','started')`
