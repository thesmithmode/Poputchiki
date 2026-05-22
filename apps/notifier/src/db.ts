import type postgres from "postgres";
import type { Category, NotifStatus, NotifierDb, Recipient } from "./types.js";

/* c8 ignore start -- SQL layer; covered by integration tests only */
export function createDb(sql: postgres.Sql): NotifierDb {
  return {
    async getRecipient(userId: string, category: Category): Promise<Recipient | null> {
      // Notifier has no GUC — escalate to poputchiki_service so RLS policies
      // users_service_select and notification_prefs_service_select allow the read.
      const rows = await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        return tx<{ tg_id: string | number; notify_disabled: boolean; pref_enabled: boolean }[]>`
          SELECT
            u.tg_id,
            u.notify_disabled,
            COALESCE(np.enabled, true) AS pref_enabled
          FROM users u
          LEFT JOIN notification_preferences np
            ON np.user_id = u.id AND np.category = ${category}
          WHERE u.id = ${userId}
          LIMIT 1
        `;
      });
      const r = rows[0];
      return r ? { ...r, tg_id: Number(r.tg_id) } : null;
    },

    async markNotifyDisabled(userId: string): Promise<void> {
      // Notifier has no GUC — escalate to poputchiki_service (users_service_update policy).
      await sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_service`;
        await tx`UPDATE users SET notify_disabled = true WHERE id = ${userId}`;
      });
    },

    /**
     * Multi-replica dedup: ON CONFLICT DO NOTHING на notification_id (UNIQUE).
     * При двух параллельных replicas получивших один NOTIFY-event:
     *   - Первый INSERT успешен → returns true → шлёт в TG.
     *   - Второй INSERT попадает в conflict → returns [] → returns false → skip.
     * notification_id = buildDedupKey(payload) — детерминирован, одинаков на всех replicas.
     */
    async tryLogNotification(
      notificationId: string,
      userId: string,
      category: string,
    ): Promise<boolean> {
      const rows = await sql`
        INSERT INTO notification_log (notification_id, user_id, category, status)
        VALUES (${notificationId}, ${userId}::uuid, ${category}, 'sent')
        ON CONFLICT (notification_id) DO NOTHING
        RETURNING notification_id
      `;
      return rows.length > 0;
    },

    async updateNotificationStatus(notificationId: string, status: NotifStatus): Promise<void> {
      await sql`
        UPDATE notification_log SET status = ${status} WHERE notification_id = ${notificationId}
      `;
    },
  };
}
/* c8 ignore stop */

export function buildDsn(): string {
  return (
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DB}`
  );
}
