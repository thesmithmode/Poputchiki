---
title: "book_seat on Driver Accept, Not on Passenger Request"
aliases: [book-seat-accept, seats-taken-accept, reservation-on-accept, ride-booking-flow]
tags: [backend, rides, booking, architecture, gotcha]
sources:
  - "daily/2026-05-17.md"
created: 2026-05-17
updated: 2026-05-17
---

# book_seat on Driver Accept, Not on Passenger Request

Calling `book_seat()` when a passenger submits a request (not when the driver accepts it) causes `seats_taken` to reflect pending requests rather than confirmed passengers. This breaks `GET /mine?role=passenger` (filters by `status='accepted'` that is never set), causes ride capacity to be exhausted by unconfirmed requests, and misrepresents the ride's actual fill level in the UI.

## Key Points

- Wrong flow: `POST /:id/request` calls `book_seat()` → `seats_taken` increments on every pending request
- Correct flow: `POST /:id/request` only creates `ride_request` row with `status='pending'`; `PATCH /:id/requests/:reqId` (accept) calls `book_seat()` and sets `status='accepted'`
- A missing `PATCH /rides/:id/requests/:reqId` endpoint was the root cause — no accept/reject path existed
- `GET /mine?role=passenger` must filter by `status IN ('accepted', 'completed')`, not `status='accepted'` alone if the old wrong flow set a different status
- Driver UI must receive `pending_requests` array in `GET /:id` to be able to accept or reject

## Details

In the Poputchiki ride booking flow, a passenger requests to join a ride and the driver can accept or reject. The `seats_taken` counter on the ride must reflect confirmed passengers — not pending applicants — so that the displayed availability is accurate and a driver can decide how many more passengers to accept before the ride is full.

The root cause found on 2026-05-17: `book_seat()` was wired to the request-creation path (`POST /:id/request`). Every `ride_request` row created, whether the driver ever accepted it or not, decremented available seats. A ride with 3 seats and 4 pending (unaccepted) requests would appear full even with zero confirmed passengers.

The cascading effect: `GET /mine?role=passenger` filtered for `status='accepted'` in the join between `rides` and `ride_requests`. Because `book_seat()` fired at request time without transitioning the status to `'accepted'`, the status remained `'pending'` indefinitely and no rides appeared in the passenger's "my rides" list.

Correct flow implementation:

```typescript
// POST /:id/request — create pending request, NO book_seat
router.post("/:id/request", async (c) => {
  await sql`INSERT INTO ride_requests (ride_id, passenger_id, status) VALUES (${rideId}, ${userId}, 'pending')`;
  // emit notification to driver
  return c.json({ status: "pending" });
});

// PATCH /:id/requests/:reqId — accept → book_seat
router.patch("/:id/requests/:reqId", async (c) => {
  const { action } = await c.req.json(); // 'accept' | 'reject'
  if (action === "accept") {
    await sql.begin(async (tx) => {
      await tx`SELECT book_seat(${rideId})`; // decrements available seats
      await tx`UPDATE ride_requests SET status = 'accepted' WHERE id = ${reqId}`;
    });
    // emit notification to passenger
  } else {
    await sql`UPDATE ride_requests SET status = 'rejected' WHERE id = ${reqId}`;
  }
  return c.json({ ok: true });
});
```

The `PATCH` endpoint did not exist before 2026-05-17 and had to be added as part of this fix. The driver UI also needed `pending_requests` included in `GET /:id` responses so the driver could see who was waiting.

Existing tests `markParticipants.test.ts` and `confirmParticipation.test.ts` used `POST /request` to set up accepted-passenger state. These tests needed updating to use the new two-step flow: create request, then patch to accept.

## Related Concepts

- [[concepts/on-conflict-constraint-pitfall]] — Same category: silent data integrity issue caused by operation firing at wrong lifecycle point; both require transactional correction
- [[concepts/rls-guc-identity]] — `book_seat()` runs inside a transaction with GUC identity set; RLS policies on `ride_requests` apply to both the request creation and the accept update
- [[concepts/advisory-lock-pool-safety]] — `book_seat()` is a critical section; if it uses advisory locks, they must be transaction-level (`pg_try_advisory_xact_lock`) not session-level

## Sources

- [[daily/2026-05-17.md]] — Session 12:12: root cause "broken join": `book_seat()` on request not on accept → `seats_taken` wrong; `GET /mine?role=passenger` filtered `status='accepted'` never reached; `PATCH /:id/requests/:reqId` endpoint missing entirely; driver UI needs `pending_requests` in `GET /:id`
