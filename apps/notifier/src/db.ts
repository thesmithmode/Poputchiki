import type postgres from "postgres";
import type { Category, NotifierDb, Recipient } from "./types.js";

/* c8 ignore start -- SQL layer; covered by integration tests only */
export function createDb(sql: postgres.Sql): NotifierDb {
  return {
    async getRecipient(userId: string, category: Category): Promise<Recipient | null> {
      const rows = await sql<{ tg_id: number; notify_disabled: boolean; pref_enabled: boolean }[]>`
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
      return rows[0] ?? null;
    },

    async markNotifyDisabled(userId: string): Promise<void> {
      await sql`UPDATE users SET notify_disabled = true WHERE id = ${userId}`;
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
