---
title: "enqueueNotificationBatch — Batch Notification Dispatch via UNNEST"
aliases: [enqueueNotificationBatch, batch-notifications, notification-batch-insert]
tags: [backend, notifications, performance, postgresql, pattern]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# enqueueNotificationBatch — Batch Notification Dispatch via UNNEST

`enqueueNotificationBatch` extends the `enqueueNotification` helper to handle multiple recipients in a single DB round-trip. It uses a PostgreSQL `UNNEST` INSERT to write all `user_notifications` rows at once, then iterates pg_notify calls per recipient. pg_notify is kept in a loop (not batched) because it is lightweight (no disk I/O, memory-only signal) and does not benefit from batching the same way INSERTs do.

## Key Points

- Single UNNEST INSERT for N notifications: one round-trip vs N sequential round-trips
- pg_notify stays in a loop: it is a memory-only signal (no WAL, no fsync) — loop overhead is negligible
- Use case: ridesRouter fan-out (e.g., notify all passengers when driver cancels — 5 for-loops → 1 batch call)
- `enqueueNotification` (single) remains for 1:1 notifications; `enqueueNotificationBatch` for 1:N
- Tests: one mock for the UNNEST INSERT + one mock per pg_notify call per recipient — total count same as before

## Details

Before the batch helper, `ridesRouter.ts` had 5 for-loops calling `enqueueNotification` once per recipient:

```typescript
// BEFORE: N round-trips
for (const passenger of passengers) {
  await enqueueNotification(sql, passenger.user_id, "ride_cancelled", { rideId });
}
```

At 50 passengers per ride this is 50 INSERT round-trips + 50 pg_notify calls sequentially. At high concurrency (many simultaneous ride cancellations) this creates DB pressure proportional to max-passengers.

The batch version:

```typescript
// packages/shared/src/notifications/enqueue.ts

export async function enqueueNotificationBatch(
  sql: Sql,
  notifications: Array<{
    userId: string;
    type: NotificationCategory;
    data: Record<string, unknown>;
  }>
): Promise<void> {
  if (notifications.length === 0) return;

  const userIds = notifications.map(n => n.userId);
  const types = notifications.map(n => n.type);
  const datas = notifications.map(n => JSON.stringify(n.data));

  // Single UNNEST INSERT for all recipients
  await sql`
    INSERT INTO user_notifications (user_id, type, data)
    SELECT * FROM UNNEST(
      ${sql.array(userIds)}::uuid[],
      ${sql.array(types)}::text[],
      ${sql.array(datas)}::jsonb[]
    )
  `;

  // pg_notify per recipient — lightweight, no disk I/O, loop is fine
  for (const { userId, type, data } of notifications) {
    await sql`
      SELECT pg_notify('notify_user', ${JSON.stringify({ user_id: userId, type, data })})
    `;
  }
}
```

**Why pg_notify stays in a loop:** pg_notify is an in-memory signal that triggers the LISTEN handler in the notifier process. It does not write to the WAL, does not touch heap storage, and completes in microseconds. Combining N pg_notify calls into one SQL statement provides no meaningful latency improvement — the bottleneck for notifications is never the signal itself but the INSERT into `user_notifications`. The UNNEST benefit targets precisely that bottleneck.

**Test implications:** Tests previously mocked N calls to `enqueueNotification` (each requiring an INSERT mock + pg_notify mock). With `enqueueNotificationBatch`, the test mocks one UNNEST INSERT + N pg_notify calls. The total mock count per notification is unchanged (2 per recipient), but the INSERT mocks collapse to one regardless of recipient count.

## Related Concepts

- [[concepts/enqueue-notification-helper]] — The 1:1 notification helper; `enqueueNotificationBatch` follows the same atomic INSERT-first pattern extended to N recipients
- [[concepts/fire-and-forget-sql-mock]] — Mock maintenance: batch INSERT = one `mockResolvedValueOnce`, pg_notify loop = one per recipient — total count unchanged
- [[concepts/pg-notify-single-channel]] — The `notify_user` channel that both helpers write to
- [[concepts/n-plus-one-sse-invalidation]] — Client-side N+1 via SSE refetch; batch dispatch reduces the analogous server-side N+1

## Sources

- [[daily/2026-05-22.md]] — Session 18:15: commit 35a1f60 added `enqueueNotificationBatch` to `packages/shared/src/notifications/enqueue.ts`; replaced 5 for-loops in `apps/api/src/rides/ridesRouter.ts`; pg_notify kept in loop because lightweight (no disk I/O); 895 tests green after updating mocks
