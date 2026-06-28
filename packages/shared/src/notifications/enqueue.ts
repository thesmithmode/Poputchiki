import { type NotificationCategory, isNotificationCategory } from "./categories.js";
import { getHourlyLimit } from "./throttle.js";

/**
 * Minimal tagged-template SQL surface (compatible with postgres.js Sql /
 * TransactionSql). Kept narrow so shared doesn't pull in postgres as a
 * dependency — apps already do. The result is awaitable; we don't constrain
 * the awaited shape because postgres.js PendingQuery's `then` is private and
 * would otherwise reject a structural assignability check.
 */
// biome-ignore lint/suspicious/noExplicitAny: structural match for postgres.js Sql / TransactionSql
type SqlTaggedFn = <_T = any>(strings: TemplateStringsArray, ...values: unknown[]) => any;
// postgres.js helper: оборачивает объект в jsonb parameter без двойной сериализации.
// biome-ignore lint/suspicious/noExplicitAny: postgres.js json signature varies by version
type JsonHelper = (value: any) => any;
type SqlTagged = SqlTaggedFn & { json: JsonHelper };

export interface EnqueueArgs {
  userId: string;
  category: NotificationCategory;
  rideId?: string | null;
  data?: Record<string, unknown>;
}

type EnqueueResult = { inserted: boolean };

async function enqueueOne(sql: SqlTagged, args: EnqueueArgs): Promise<boolean> {
  const limit = getHourlyLimit(args.category);
  const rows = await sql<EnqueueResult[]>`
    SELECT app.enqueue_user_notification(
      ${args.userId}::uuid,
      ${args.category},
      ${args.rideId ?? null}::uuid,
      ${sql.json(args.data ?? {})}::jsonb,
      ${limit}::integer
    ) AS inserted
  `;
  return Boolean(rows?.[0]?.inserted);
}

/**
 * Persist + dispatch a user notification atomically.
 *
 * Root cause we are fixing: call-sites previously did two independent
 * fire-and-forget queries — `pg_notify('notify_user', ...)` and (sometimes)
 * `INSERT INTO user_notifications`. Most call-sites had only the pg_notify,
 * so the in-app feed never saw the row even though the TG bot delivered the
 * message. The feed-then-push ordering here means the row exists before any
 * notifier worker reads the channel. The DB function performs throttle check,
 * insert, and notify in one SECURITY DEFINER statement so RLS cannot hide the
 * recipient's existing rows from cross-recipient notification producers.
 */
export async function enqueueNotificationBatch(
  sql: SqlTagged,
  items: EnqueueArgs[],
): Promise<void> {
  if (items.length === 0) return;
  for (const { userId, category } of items) {
    if (!isNotificationCategory(category)) {
      throw new Error(`enqueueNotificationBatch: invalid category '${category}'`);
    }
    if (!userId) throw new Error("enqueueNotificationBatch: userId required");
  }

  for (const item of items) {
    await enqueueOne(sql, item);
  }
}

export async function enqueueNotification(sql: SqlTagged, args: EnqueueArgs): Promise<void> {
  if (!isNotificationCategory(args.category)) {
    throw new Error(`enqueueNotification: invalid category '${args.category}'`);
  }
  if (!args.userId) {
    throw new Error("enqueueNotification: userId required");
  }

  await enqueueOne(sql, args);
}
