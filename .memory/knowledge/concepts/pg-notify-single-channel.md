---
title: "pg_notify Single Channel Architecture — notify_user Pattern"
aliases: [pg-notify-channel, notify-user-channel, pg-notify-standardization, single-notification-channel]
tags: [postgresql, notifications, sse, architecture, pattern]
sources:
  - "daily/2026-05-17.md"
created: 2026-05-17
updated: 2026-05-17
---

# pg_notify Single Channel Architecture — notify_user Pattern

Using per-event `pg_notify` channels (`ride_request`, `ride_cancelled`, `participation_request`) proliferates listener registrations in the notifier service and creates naming inconsistencies. A single `notify_user` channel with a `user_id` field in the JSON payload routes all user-targeted events through one listener and simplifies the notifier's subscription model.

## Key Points

- Per-event channels require one `LISTEN <channel>` per event type in the notifier service — any new event type needs a new listener
- Single `notify_user` channel with `{ user_id, type, data }` payload routes all events through one listener; type-based dispatch happens in application code
- Channel name chaos found in Poputchiki: `ride_request`, `ride_cancelled`, `participation_request` — all targeting individual users but with no shared routing key
- The `user_id` in the payload enables fan-out to the correct SSE stream without multiple channel subscriptions
- Notifier service listens on one channel and dispatches to the correct connected client by `user_id` lookup

## Details

PostgreSQL's `LISTEN/NOTIFY` mechanism is designed for lightweight event signaling. Each channel is a named string; a process can listen on multiple channels simultaneously. The architectural question is granularity: one channel per event type, or one channel per routing dimension.

Per-event channels (`LISTEN ride_request`, `LISTEN ride_cancelled`, `LISTEN participation_request`) require the notifier process to:
1. Maintain a separate `LISTEN` for every event type
2. Add a new `LISTEN` call whenever a new notification type is introduced
3. Map channel names to handler logic in a growing switch/case or if-chain

The `notify_user` single-channel pattern consolidates this:

```sql
-- In ridesRouter: passenger submits request
SELECT pg_notify('notify_user', json_build_object(
  'user_id', driver_id,
  'type', 'booking_request',
  'data', json_build_object('ride_id', ride_id, 'passenger_name', passenger_name)
)::text);

-- In rideRequestsRouter: driver accepts
SELECT pg_notify('notify_user', json_build_object(
  'user_id', passenger_id,
  'type', 'booking_accepted',
  'data', json_build_object('ride_id', ride_id)
)::text);
```

The notifier service:

```typescript
sql.listen("notify_user", (payload) => {
  const { user_id, type, data } = JSON.parse(payload);
  const stream = sseManager.getStream(user_id);
  if (stream) {
    stream.send({ type, data });
  }
  // Also persist to user_notifications table for async delivery
});
```

This pattern maps cleanly to the `user_notifications` table (migration 025), which stores the same `{ user_id, type, data }` structure for persistent notification history. The SSE delivery and the DB persistence share the same dispatch path.

A secondary benefit: `notify_user` makes RLS and security reasoning simpler. All notification payloads that reach a user's SSE stream were routed by `user_id` match — there is no risk of a user receiving another user's notification due to being subscribed to a broad event channel.

The channel name chaos in Poputchiki was discovered on 2026-05-17 when adding the notifications feature end-to-end. Different routes had been written at different times and each author chose a different channel name. The standardization was a one-session cleanup that touched ridesRouter, rideRequestsRouter, and the notifier service.

## Related Concepts

- [[concepts/sse-pool-connection-ceiling]] — SSE fan-out is the delivery mechanism for `notify_user` events; the single-channel pattern complements the single shared LISTEN connection architecture needed to avoid pool exhaustion
- [[concepts/hono-onerror-required]] — pg_notify calls inside route handlers should be fire-and-forget with `.catch()`; errors in notification delivery must not fail the main request
- [[concepts/fire-and-forget-sql-mock]] — Each `pg_notify` call in a handler requires an additional `mockResolvedValueOnce([])` in tests — same mock maintenance rule applies

## Sources

- [[daily/2026-05-17.md]] — Session 15:04: pg_notify chaos found — three different channel names across routes; standardized to single `notify_user` channel with `user_id` in payload; notifier service updated to single LISTEN; user_notifications table (migration 025) shares same payload structure for persistence
