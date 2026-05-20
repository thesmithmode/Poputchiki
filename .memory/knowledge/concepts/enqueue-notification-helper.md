---
title: "enqueueNotification Helper — Centralised Notification Dispatch"
aliases: [enqueueNotification, notification-helper, centralised-notify, shared-enqueue]
tags: [backend, notifications, architecture, pattern, shared-package]
sources:
  - "daily/2026-05-18.md"
created: 2026-05-18
updated: 2026-05-18
---

# enqueueNotification Helper — Centralised Notification Dispatch

`enqueueNotification` is a shared helper that atomically inserts a row into `user_notifications` and fires `pg_notify('notify_user', ...)` in a single call. It replaces 11 scattered `pg_notify` call sites that previously skipped the DB insert, causing the in-app feed to miss most events.

## Key Points

- Replaces 11 call sites of bare `pg_notify` with a two-step atomic operation: `INSERT INTO user_notifications` first, then `pg_notify` second
- Lives in `packages/shared` — not `apps/api` — so `cron` and other services can import it without circular dependency
- Mock order matters: tests that previously needed one `mockResolvedValueOnce` per handler now need two — INSERT first, pg_notify second
- `canonical CATEGORIES` constant also added to shared package to eliminate 4-way category drift across files
- Must be fire-and-forget with `.catch(noop)` in route handlers to avoid failing the main request on notification errors

## Details

The root cause of the notification gap: 8 of 11 `pg_notify` call sites across `ridesRouter`, `rideRequestsRouter`, and related routers emitted the realtime signal but never wrote to `user_notifications`. The in-app Events feed reads from `user_notifications`; SSE pushes from `pg_notify`. Without the INSERT, the feed was empty even though realtime delivery worked. Users who closed and reopened the app saw no event history.

The helper signature:

```typescript
// packages/shared/src/notifications.ts
export async function enqueueNotification(
  sql: Sql,
  userId: string,
  type: NotificationCategory,
  data: Record<string, unknown>
): Promise<void> {
  await sql`
    INSERT INTO user_notifications (user_id, type, data)
    VALUES (${userId}, ${type}, ${JSON.stringify(data)})
  `;
  await sql`
    SELECT pg_notify('notify_user', ${JSON.stringify({ user_id: userId, type, data })})
  `;
}
```

The INSERT fires first so that even if the process crashes between the two calls, the notification is persisted and can be delivered on the next SSE reconnect. The reverse order (pg_notify first) would risk delivering a realtime event that is never written to the DB, causing the notification to vanish on page refresh.

**Test impact:** Every route handler that previously had one fire-and-forget `pg_notify` and one `mockResolvedValueOnce` now requires two mock values — one for the INSERT and one for the pg_notify call. The order must match the helper's implementation. Tests that were not updated produced `TypeError: Cannot destructure property of undefined` on the second SQL call.

Moving the helper from `apps/api` to `packages/shared` was necessary because `apps/cron` also needs to emit notifications (ride expiry, booking reminder) and cannot import from `apps/api` without creating a circular workspace dependency. Shared package is the correct home for cross-app utilities.

## Related Concepts

- [[concepts/pg-notify-single-channel]] — The `notify_user` channel and payload schema that `enqueueNotification` uses
- [[concepts/fire-and-forget-sql-mock]] — Mock maintenance rule: every SQL call in a handler needs a corresponding `mockResolvedValueOnce`; `enqueueNotification` adds two calls per notification site
- [[concepts/notification-category-drift]] — Canonical `CATEGORIES` constant added to shared package alongside this helper to fix the 4-way drift
- [[concepts/pg-notify-missing-user-notifications]] — The root bug that `enqueueNotification` resolves

## Sources

- [[daily/2026-05-18.md]] — Session 15:01: `enqueueNotification` helper created; moved to `packages/shared`; 11 pg_notify call sites replaced; mock order (INSERT first, pg_notify second) must match in tests; canonical CATEGORIES also added to shared
