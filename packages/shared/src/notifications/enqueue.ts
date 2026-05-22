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

  const userIds = items.map((i) => i.userId);
  const categories = items.map((i) => i.category);
  const rideIds = items.map((i) => i.rideId ?? null);
  const dataValues = items.map((i) => JSON.stringify(i.data ?? {}));

  await sql`
    INSERT INTO user_notifications (user_id, category, ride_id, data)
    SELECT u::uuid, c, r::uuid, d::jsonb
    FROM unnest(
      ${userIds}::text[],
      ${categories}::text[],
      ${rideIds}::text[],
      ${dataValues}::text[]
    ) AS t(u, c, r, d)
  `;

  for (const { userId, category, rideId, data } of items) {
    const payload = JSON.stringify({
      user_id: userId,
      category,
      ...(rideId ? { ride_id: rideId } : {}),
      ...(data ?? {}),
    });
    await sql`SELECT pg_notify('notify_user', ${payload})`;
  }
}

export async function enqueueNotification(sql: SqlTagged, args: EnqueueArgs): Promise<void> {
  if (!isNotificationCategory(args.category)) {
    throw new Error(`enqueueNotification: invalid category '${args.category}'`);
  }
  if (!args.userId) {
    throw new Error("enqueueNotification: userId required");
  }

  const rideId = args.rideId ?? null;
  const data = args.data ?? {};

  // Per-recipient throttle: защита от спама inbox. Лимиты в throttle.ts.
  // null = без лимита (system, admin_*).
  const limit = getHourlyLimit(args.category);
  if (limit !== null) {
    const counted = await sql<{ c: number | string }[]>`
      SELECT COUNT(*) AS c FROM user_notifications
      WHERE user_id = ${args.userId}::uuid
        AND category = ${args.category}
        AND created_at > NOW() - INTERVAL '1 hour'
    `;
    const n = Number(counted?.[0]?.c ?? 0);
    if (n >= limit) {
      // Throttle silent: shared library не зависит от console (нет @types/node).
      // Observability на стороне call-sites — они логируют return == void как dropped.
      return;
    }
  }

  // postgres.js сериализует строку для ::jsonb как jsonb-string (двойная сериализация).
  // sql.json() оборачивает объект как jsonb parameter → сохраняется как jsonb-object.
  await sql`
    INSERT INTO user_notifications (user_id, category, ride_id, data)
    VALUES (
      ${args.userId}::uuid,
      ${args.category},
      ${rideId}::uuid,
      ${sql.json(data)}::jsonb
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
