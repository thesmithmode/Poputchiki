---
title: "Notifier/Cron Service Role RLS Trap — Silent 0 Rows Without SET ROLE"
aliases: [notifier-rls-trap, service-role-rls, cron-rls-trap, set-role-service, poputchiki_service-rls]
tags: [backend, postgresql, rls, notifications, gotcha, architecture]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Notifier/Cron Service Role RLS Trap — Silent 0 Rows Without SET ROLE

Service processes (notifier, cron) that execute SQL without setting GUC identity or switching to a service role are silently blocked by RLS policies written for the application role. The result is 0 rows returned on every SELECT — no error, no log entry — causing notifications to never be sent, cleanups to never run, and scheduled jobs to silently no-op.

## Key Points

- `notifier/src/db.ts:getRecipient` issued `SELECT FROM users` without GUC or `SET LOCAL ROLE poputchiki_service` → RLS policy `USING (app.current_user_id() IS NOT NULL)` → current_setting returns NULL → 0 rows
- `notifier` logs `notifier_user_not_found` for every notification → TG bot never receives the message to send
- Fix: wrap `getRecipient` and `markNotifyDisabled` in `sql.begin()` + `SET LOCAL ROLE poputchiki_service`
- Three new RLS policies required in a migration: `poputchiki_service` SELECT on users, UPDATE on users, SELECT on notification_preferences
- `apps/api` sets GUC (`app.current_user_id`) per request — correct; `apps/notifier`/`apps/cron` have no per-request identity → must use service role instead

## Details

The RLS architecture in Poputchiki is built around `app.current_user_id` GUC set per transaction by `apps/api`. Every RLS policy on sensitive tables uses `USING (current_setting('app.current_user_id', true) IS NOT NULL)` or a user-specific filter. This works correctly for the API layer.

Service processes (notifier, cron) do not process user requests — they react to pg_notify events or scheduled triggers and operate across users. They have no per-request identity to set. When these processes issue SQL, PostgreSQL evaluates RLS as the connecting role (`poputchiki_app` if DATABASE_URL uses that role). If the USING clause requires `app.current_user_id` to be set (and it is not), the policy evaluates to false for every row → 0 rows returned → silent failure.

The diagnostic chain for the 2026-05-19 bug:
1. TG notifications not being sent despite `enqueueNotification` firing correctly
2. Notifier service logging `notifier_user_not_found` for every notification event
3. `getRecipient(userId)` running `SELECT FROM users WHERE id = $1` → 0 rows
4. Root cause: notifier connects as `poputchiki_app`, no GUC set, RLS blocks the SELECT entirely

The fix pattern for service processes:

```typescript
// notifier/src/db.ts
export async function getRecipient(sql: Sql, userId: string) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    const [user] = await tx`
      SELECT id, tg_id, notify_disabled
      FROM users
      WHERE id = ${userId}
    `;
    return user ?? null;
  });
}

export async function markNotifyDisabled(sql: Sql, userId: string) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    await tx`UPDATE users SET notify_disabled = true WHERE id = ${userId}`;
  });
}
```

The migration (`027_notifier_service_rls.sql`) adds three policies:

```sql
-- SELECT policy for notifier to read recipient info
CREATE POLICY notifier_select_users ON users
  FOR SELECT TO poputchiki_service
  USING (true);  -- service role sees all users it needs

-- UPDATE policy for notifier to mark notify_disabled
CREATE POLICY notifier_update_users ON users
  FOR UPDATE TO poputchiki_service
  USING (true);

-- SELECT policy for notification_preferences
CREATE POLICY notifier_select_notification_prefs ON notification_preferences
  FOR SELECT TO poputchiki_service
  USING (true);
```

**General rule for service processes:** Any backend service that is not `apps/api` (notifier, cron, webhook) must either:
1. Use `SET LOCAL ROLE poputchiki_service` inside a transaction before any cross-user SQL, OR
2. Have dedicated BYPASSRLS-capable policies for the operations it performs

The failure is always the same: silent 0 rows, no exception, feature appears broken with no traceable error in the application layer.

## Related Concepts

- [[concepts/rls-guc-identity]] — GUC pattern for `apps/api` per-request identity; notifier/cron cannot use this because they have no per-request user context
- [[concepts/superuser-database-url-rls-bypass]] — Complementary risk: if DATABASE_URL uses superuser, RLS is bypassed entirely; service role is the correct middle ground
- [[concepts/enqueue-notification-helper]] — The helper that fires pg_notify and writes to user_notifications; the notifier's getRecipient is what reads back the recipient info to deliver via TG
- [[concepts/telegram-bot-403-notify-disabled]] — markNotifyDisabled is the function that also suffered from this RLS trap; fixing getRecipient unblocked the entire TG delivery chain

## Sources

- [[daily/2026-05-19.md]] — Session 12:45: `notifier/src/db.ts:getRecipient` SELECT FROM users without GUC → RLS NULL → 0 rows → `notifier_user_not_found` → TG never receives; fix: migration 027 (3 service-role policies) + `SET LOCAL ROLE poputchiki_service` inside `sql.begin()` in both `getRecipient` and `markNotifyDisabled`
