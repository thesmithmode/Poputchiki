---
title: "pg_notify Without user_notifications INSERT — In-App Feed Blackout"
aliases: [pg-notify-no-insert, notification-feed-blackout, notify-without-persist, missing-notification-insert]
tags: [backend, notifications, bug, architecture, postgresql]
sources:
  - "daily/2026-05-18.md"
created: 2026-05-18
updated: 2026-05-18
---

# pg_notify Without user_notifications INSERT — In-App Feed Blackout

Calling `pg_notify` without simultaneously inserting into `user_notifications` delivers a realtime SSE event but leaves no persistent record. The Events feed (which reads from `user_notifications`) shows nothing. Users who miss the realtime push or reopen the app see an empty history even though events did occur.

## Key Points

- 8 of 11 `pg_notify` call sites in Poputchiki were missing the accompanying `INSERT INTO user_notifications`
- SSE delivery (live push) worked; in-app history feed was empty — two different code paths with one shared trigger
- likes, reviews, and favorites routers had no `pg_notify` at all — feature effectively absent
- The audit found this by tracing each notification-triggering route handler and checking for both the INSERT and the pg_notify
- Fix: `enqueueNotification` helper enforces both operations atomically, making omission structurally impossible

## Details

The Poputchiki notification system has two delivery channels: realtime (SSE via `pg_notify`) and persistent history (`user_notifications` table). A fully correct notification requires both: the realtime push for users currently online, and the DB record for users who come back later or whose SSE connection was interrupted.

When a route handler emits only `pg_notify('notify_user', ...)`, the notifier service receives the event and forwards it to any active SSE subscriber. This path works. However, the `user_notifications` table receives no row. When the frontend fetches `GET /notifications`, it reads from `user_notifications` and returns empty. The Events tab shows "Нет событий" despite real activity.

The Phase 1 audit on 2026-05-18 enumerated all 11 `pg_notify` call sites by grepping for `pg_notify` across the codebase. For each site, the surrounding code was checked for a corresponding INSERT:

| Router | Call site | Had INSERT? |
|--------|-----------|-------------|
| ridesRouter (create) | booking_request to driver | No |
| ridesRouter (cancel) | ride_cancelled to passengers | No |
| rideRequestsRouter (accept) | booking_accepted to passenger | No |
| rideRequestsRouter (reject) | booking_rejected to passenger | No |
| ... (4 more) | various | No |
| likesRouter | like_received to author | No `pg_notify` at all |
| reviewsRouter | review_received to author | No `pg_notify` at all |
| favoritesRouter | favorite_new_ride to driver | No `pg_notify` at all |

The 3 routers with no `pg_notify` at all represent features that effectively did not send any notifications — neither realtime nor persistent.

**Why it happened:** Each router was implemented by a different agent in a different session. The convention "also write to `user_notifications`" was never enforced structurally — it was only a documentation requirement. Without a shared helper that makes the INSERT mandatory, each implementation independently chose to emit the signal or skip the persistence.

The `enqueueNotification` helper (see [[concepts/enqueue-notification-helper]]) was the structural fix: callers cannot emit a pg_notify without also inserting the record, because both operations are inside the helper.

## Related Concepts

- [[concepts/enqueue-notification-helper]] — The helper that atomically performs both operations, preventing this class of omission
- [[concepts/pg-notify-single-channel]] — The `notify_user` channel architecture; this bug was independent of channel design but co-existed with it
- [[concepts/fire-and-forget-sql-mock]] — Test maintenance: each notification site now has two SQL calls that need mocks
- [[concepts/notification-category-drift]] — Co-discovered during the same audit: 4 different category lists caused notifier to reject valid notification types

## Sources

- [[daily/2026-05-18.md]] — Session 14:33: Phase 1 audit found 8 of 11 pg_notify call sites missing INSERT into user_notifications; 3 routers (likes/reviews/favorites) had no pg_notify at all; root cause: no structural enforcement of the two-step pattern; fixed by enqueueNotification helper
