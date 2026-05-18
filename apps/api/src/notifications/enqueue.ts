import { type NotificationCategory, isNotificationCategory } from "@poputchiki/shared";
import type postgres from "postgres";

/**
 * Persist + dispatch a user notification atomically.
 *
 * Root cause we are fixing: every call site previously did two separate
 * fire-and-forget SQL calls — `pg_notify('notify_user', ...)` and (sometimes)
 * `INSERT INTO user_notifications`. Most call sites had only the pg_notify,
 * so the in-app feed (`/notifications`) never saw the row even though the TG
 * bot delivered the message. That's why events "stayed new" or never
 * appeared at all.
 *
 * This helper performs INSERT then NOTIFY in the same query handle (postgres.js
 * already serializes within a Sql or TransactionSql instance), so the feed
 * row exists before any worker reads the channel. When passed a transaction
 * handle from `withIdentity`, the writes are part of the same transaction —
 * row + notify either both succeed or both rollback.
 */

export interface EnqueueArgs {
  userId: string;
  category: NotificationCategory;
  rideId?: string | null;
  data?: Record<string, unknown>;
}

export async function enqueueNotification(
  sql: postgres.Sql | postgres.TransactionSql,
  args: EnqueueArgs,
): Promise<void> {
  if (!isNotificationCategory(args.category)) {
    throw new Error(`enqueueNotification: invalid category '${args.category}'`);
  }
  if (!args.userId) {
    throw new Error("enqueueNotification: userId required");
  }

  const rideId = args.rideId ?? null;
  const data = args.data ?? {};

  await sql`
    INSERT INTO user_notifications (user_id, category, ride_id, data)
    VALUES (
      ${args.userId}::uuid,
      ${args.category},
      ${rideId}::uuid,
      ${JSON.stringify(data)}::jsonb
    )
  `;

  const payload = JSON.stringify({
    user_id: args.userId,
    category: args.category,
    ...(rideId ? { ride_id: rideId } : {}),
    ...data,
  });
  await sql`SELECT pg_notify('notify_user', ${payload})`;
}
