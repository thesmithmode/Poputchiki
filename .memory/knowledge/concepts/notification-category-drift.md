---
title: "Notification Category Drift — 4 Inconsistent Category Lists"
aliases: [notification-category-drift, category-drift, notification-types-drift, canonical-categories]
tags: [backend, notifications, architecture, gotcha, shared-package]
sources:
  - "daily/2026-05-18.md"
  - "daily/2026-05-19.md"
created: 2026-05-18
updated: 2026-05-19
---

# Notification Category Drift — 4 Inconsistent Category Lists

Four separate files in the Poputchiki codebase each defined their own list of notification category strings. When a route handler emitted a category that existed in its local list but not in the notifier's list, the notifier silently rejected or ignored the notification. The fix is a canonical `CATEGORIES` (or `NotificationCategory`) constant in `packages/shared`, imported by all four sites.

## Key Points

- 4 files with independent category lists: route handlers, notifier service, frontend EventsScreen, DB enum/migration — each potentially out of sync
- A category added to a router but not to the notifier's dispatch table is silently dropped — no error, no log
- A category added to the frontend but not emitted by any router means the UI has unreachable states
- Fix: single `NotificationCategory` union type + `CATEGORIES` array in `packages/shared` imported everywhere
- Adding a new notification type requires changing one file; adding it in the wrong local list is now a TypeScript compile error
- PostgreSQL `CHECK` constraint on `user_notifications.type` must also be updated when adding a new category — migration is required; omitting this causes INSERT to fail at DB level with a constraint violation

## Details

Notification categories (also called types or event types) string-identify the kind of event being delivered: `booking_request`, `booking_accepted`, `booking_rejected`, `ride_cancelled`, etc. In Poputchiki, these strings appeared in:

1. **Route handlers** (emitting via `pg_notify` payload): each router defined its own inline string literal
2. **Notifier service** (`apps/notifier`): a dispatch table or switch/case matched incoming `pg_notify` payloads
3. **Frontend EventsScreen**: icon/label/color mapping by category string
4. **DB migration** (if categories were stored as a PostgreSQL enum or validated against a list)

Because all four locations were independent, drift accumulated session by session. A router written in session N used `"ride_cancelled"`; the notifier written in session N+2 expected `"ride_cancellation"`. The notifier received the pg_notify payload, hit the switch default case (or no matching key in an object map), and dropped the event silently.

The `likes_received` → `like_received` discrepancy found in the 2026-05-18 audit (B2 typo fix) is a concrete example: route handler emitted `"notify_user"` as the channel but the payload `type` was `"likes_received"` (plural); the notifier expected `"like_received"` (singular). Every like notification was being dropped.

**Canonical constant pattern:**

```typescript
// packages/shared/src/notifications.ts
export const NOTIFICATION_CATEGORIES = [
  "booking_request",
  "booking_accepted",
  "booking_rejected",
  "ride_cancelled",
  "like_received",
  "review_received",
  "favorite_new_ride",
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
```

All four locations import `NotificationCategory`. TypeScript enforces that any string used as a notification type is in the union. An invalid string literal produces a compile error rather than a silent runtime miss.

The migration impact: any existing `user_notifications` rows with old category strings (e.g., `"likes_received"`) remain in the DB with the old string. Either a migration renames them, or the frontend's category mapping must handle both old and new strings for backward compatibility.

## Related Concepts

- [[concepts/enqueue-notification-helper]] — `enqueueNotification` takes `NotificationCategory` as a typed parameter, making category drift a compile error at call sites
- [[concepts/pg-notify-single-channel]] — All notifications flow through `notify_user` channel; category string in the payload is the routing key within that channel
- [[concepts/pg-notify-missing-user-notifications]] — Co-discovered during the same audit; category drift and missing inserts were two separate dimensions of the same notification system audit
- [[concepts/localstorage-key-constants-in-tests]] — Same class of bug: string constants duplicated across codebase drift silently; centralise and import

## Sources

- [[daily/2026-05-18.md]] — Session 14:33: audit found 4 different category lists; notifier rejecting valid categories; B2 typo fix `notify_user` → `ride_request` in category string; Session 15:01: canonical CATEGORIES added to packages/shared alongside enqueueNotification helper
- [[daily/2026-05-19.md]] — Session 14:05: adding `ride_completed` category to `/complete` endpoint required updating `notification_preferences_category_check` CHECK constraint in migration 028 — omitting this caused INSERT failure at DB level
