/**
 * Cleanup jobs for hot tables that grow unbounded.
 * Each job uses pg_try_advisory_xact_lock to prevent duplicate runs across replicas.
 */
import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

// Advisory lock IDs — must not collide with other cron jobs.
// Taken: 100001–100006. We start at 100007.
const LOCK_RATE_LIMIT = 100007;
const LOCK_IDEMPOTENCY = 100008;
const LOCK_NOTIFICATION_LOG = 100009;
const LOCK_ERROR_LOG = 100010;
const LOCK_USER_NOTIFICATIONS = 100011;

const USER_NOTIFICATIONS_BATCH = 5000;
const USER_NOTIFICATIONS_MAX_BATCHES = 10;

/**
 * rate_limit_buckets: delete expired windows older than 1 hour.
 * Runs every 10 minutes.
 */
export async function cleanupRateLimitBuckets(
  sql: postgres.Sql,
): Promise<{ deleted: number } | null> {
  return withLock(sql, LOCK_RATE_LIMIT, async (tx) => {
    const countRows = await tx<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM rate_limit_buckets
        WHERE window_start < NOW() - INTERVAL '1 hour'
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    /* c8 ignore next -- COUNT(*) always returns a row */
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "rate_limit_buckets_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  });
}

/**
 * idempotency_keys: delete records older than 24 hours.
 * Runs hourly.
 */
export async function cleanupIdempotencyKeys(
  sql: postgres.Sql,
): Promise<{ deleted: number } | null> {
  return withLock(sql, LOCK_IDEMPOTENCY, async (tx) => {
    const countRows = await tx<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM idempotency_keys
        WHERE created_at < NOW() - INTERVAL '24 hours'
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    /* c8 ignore next -- COUNT(*) always returns a row */
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "idempotency_keys_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  });
}

/**
 * notification_log: delete records older than 90 days.
 * Runs daily at UTC hour 4 (after backup/restore jobs).
 */
export async function cleanupNotificationLog(
  sql: postgres.Sql,
): Promise<{ deleted: number } | null> {
  return withLock(sql, LOCK_NOTIFICATION_LOG, async (tx) => {
    const countRows = await tx<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM notification_log
        WHERE sent_at < NOW() - INTERVAL '90 days'
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    /* c8 ignore next -- COUNT(*) always returns a row */
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "notification_log_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  });
}

/**
 * user_notifications: retention 90 дней. Удаляет батчами по 5000 строк,
 * максимум 10 батчей за прогон (50 000 строк), чтобы транзакция не висла
 * долго при большом backlog. Если остались строки — добиваются на следующем
 * прогоне cron. RLS на user_notifications: DELETE-политики нет, используем
 * SET LOCAL ROLE poputchiki_service (BYPASSRLS).
 */
export async function cleanupUserNotifications(
  sql: postgres.Sql,
): Promise<{ deleted: number } | null> {
  return withLock(
    sql,
    LOCK_USER_NOTIFICATIONS,
    async (tx) => {
      let total = 0;
      for (let i = 0; i < USER_NOTIFICATIONS_MAX_BATCHES; i++) {
        const rows = await tx<{ count: number | string }[]>`
          WITH victims AS (
            SELECT id FROM user_notifications
            WHERE created_at < NOW() - INTERVAL '90 days'
            LIMIT ${USER_NOTIFICATIONS_BATCH}
          ),
          del AS (
            DELETE FROM user_notifications
            WHERE id IN (SELECT id FROM victims)
            RETURNING 1
          )
          SELECT COUNT(*) AS count FROM del
        `;
        const n = Number(rows[0]?.count ?? 0);
        total += n;
        if (n < USER_NOTIFICATIONS_BATCH) break;
      }
      // biome-ignore lint/suspicious/noConsoleLog: structured cron log
      console.log(
        JSON.stringify({
          msg: "user_notifications_cleanup",
          last_run_at: new Date().toISOString(),
          deleted_count: total,
        }),
      );
      return { deleted: total };
    },
    { useServiceRole: true },
  );
}

/**
 * error_log: delete records older than 30 days.
 * Runs daily at UTC hour 4.
 */
export async function cleanupErrorLog(sql: postgres.Sql): Promise<{ deleted: number } | null> {
  return withLock(sql, LOCK_ERROR_LOG, async (tx) => {
    const countRows = await tx<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM error_log
        WHERE created_at < NOW() - INTERVAL '30 days'
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    /* c8 ignore next -- COUNT(*) always returns a row */
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "error_log_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  });
}
