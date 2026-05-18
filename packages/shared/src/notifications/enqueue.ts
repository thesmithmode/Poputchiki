import { type NotificationCategory, isNotificationCategory } from "./categories.js";

/**
 * Minimal tagged-template SQL surface (compatible with postgres.js Sql /
 * TransactionSql). Kept narrow so shared doesn't pull in postgres as a
 * dependency — apps already do. The result is awaitable; we don't constrain
 * the awaited shape because postgres.js PendingQuery's `then` is private and
 * would otherwise reject a structural assignability check.
 */
// biome-ignore lint/suspicious/noExplicitAny: structural match for postgres.js Sql / TransactionSql
type SqlTagged = (strings: TemplateStringsArray, ...values: unknown[]) => any;

export interface EnqueueArgs {
  userId: string;
  category: NotificationCategory;
  rideId?: string | null;
  data?: Record<string, unknown>;
}

/**
 * Persist + dispatch a user notification atomically.
 *
 * Root cause we are fixing: call-sites previously did two independent
 * fire-and-forget queries — `pg_notify('notify_user', ...)` and (sometimes)
 * `INSERT INTO user_notifications`. Most call-sites had only the pg_notify,
 * so the in-app feed never saw the row even though the TG bot delivered the
 * message. The feed-then-push ordering here means the row exists before any
 * notifier worker reads the channel. When `sql` is a TransactionSql handle,
 * both writes share the transaction — row + notify commit together.
 */
export async function enqueueNotification(sql: SqlTagged, args: EnqueueArgs): Promise<void> {
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
