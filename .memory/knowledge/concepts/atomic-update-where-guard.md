---
title: "Atomic UPDATE WHERE-Guard for Concurrent Capacity Checks"
aliases: [atomic-update-guard, check-then-act-race, join-trip-race, capacity-race-condition, concurrent-update-pattern]
tags: [database, postgresql, concurrency, gotcha, pattern, critical]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# Atomic UPDATE WHERE-Guard for Concurrent Capacity Checks

Checking a capacity constraint in one query and incrementing a counter in a second query creates a race window where two concurrent requests both pass the check before either commits the increment. The fix is a single atomic UPDATE with a WHERE-guard that returns 0 rows when the constraint is violated — no separate SELECT required.

## Key Points

- Classic check-then-act race: `SELECT passengers_count < max_passengers` → (race window) → `UPDATE passengers_count + 1`
- Two concurrent requests both read the same `passengers_count`, both pass the check, both increment → capacity overflow
- Atomic fix: one UPDATE with `WHERE passengers_count < max_passengers RETURNING id` — returns 0 rows if full
- 0 rows returned = capacity exceeded; application rejects request with 409 Conflict
- Same pattern applies to: seat booking, inventory reservation, quota enforcement, token bucket rate limiting

## Details

The Poputchiki `joinTrip` handler (and similarly `book_seat` in rides) was written with two separate SQL calls:

```typescript
// WRONG: check-then-act race
const [trip] = await sql`SELECT passengers_count, max_passengers FROM trips WHERE id = ${tripId}`;
if (trip.passengers_count >= trip.max_passengers) throw new Error("Full");
await sql`UPDATE trips SET passengers_count = passengers_count + 1 WHERE id = ${tripId}`;
```

If two requests arrive simultaneously, both execute the SELECT and both see `passengers_count < max_passengers`. Both pass the check. Both increment. The trip now has `passengers_count > max_passengers`.

The atomic WHERE-guard collapses both into one operation:

```sql
-- CORRECT: atomic UPDATE with constraint guard
UPDATE trips
SET passengers_count = passengers_count + 1
WHERE id = $1
  AND passengers_count < max_passengers
RETURNING id;
```

```typescript
const [result] = await sql`
  UPDATE trips
  SET passengers_count = passengers_count + 1
  WHERE id = ${tripId}
    AND passengers_count < max_passengers
  RETURNING id
`;
if (!result) return c.json({ error: "Trip is full" }, 409);
```

PostgreSQL executes this as an atomic read-modify-write under row-level locking (`FOR UPDATE` equivalent on the updated row). The `WHERE` clause is evaluated against the locked row's current value — no race window exists between the check and the increment.

**Why RETURNING matters:** Without `RETURNING id`, the application cannot distinguish between "trip not found" and "trip full" — both return 0 affected rows. `RETURNING id` provides evidence that the UPDATE matched at least the `WHERE id = $1` part; if 0 rows returned with a valid ID, the capacity constraint fired.

**Composite pattern for atomic capacity + conflict detection:**

```sql
-- Book seat only if available AND not already booked
UPDATE trips
SET passengers_count = passengers_count + 1
WHERE id = $1
  AND passengers_count < max_passengers
  AND NOT EXISTS (
    SELECT 1 FROM trip_passengers
    WHERE trip_id = $1 AND user_id = $2
  )
RETURNING id;
```

This pattern eliminates the race between capacity check, duplicate-booking check, and the increment — all in one atomic statement.

**The UNIQUE partial index complement:** While the atomic UPDATE prevents counter overflow, a `UNIQUE partial index` prevents duplicate rows if the application-level logic fails:

```sql
-- Prevent duplicate active trips per driver
CREATE UNIQUE INDEX trips_driver_active_uniq
ON trips(driver_id)
WHERE status IN ('active', 'started');
```

The index is a structural safety net — the code should already enforce it, but the index catches any code path that bypasses the check.

## Related Concepts

- [[concepts/advisory-lock-pool-safety]] — Advisory locks are an alternative for complex multi-step critical sections where a single UPDATE is insufficient; for simple counter increments, the WHERE-guard is simpler and pool-safe
- [[concepts/on-conflict-constraint-pitfall]] — Related class: missing unique constraints cause silent duplicate inserts; the partial index here provides the same structural enforcement
- [[concepts/book-seat-on-accept-not-request]] — `book_seat()` function in Poputchiki should use this atomic pattern internally rather than check-then-increment

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-db-review finding #1 CRITICAL: `joinTrip` check-then-act race — `passengers_count < max_passengers` SELECT + separate INCREMENT UPDATE → overflow at concurrency; fix: atomic `UPDATE ... WHERE passengers_count < max_passengers RETURNING id`; same finding from sector-api-review #3
