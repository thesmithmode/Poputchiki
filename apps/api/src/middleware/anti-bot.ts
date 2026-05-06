import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import type { AppUser } from "./identity-guard";

const MS_24H = 24 * 60 * 60 * 1000;

export function antiBot(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user" as never) as AppUser | undefined;
    if (!user || user.role === "admin") {
      await next();
      return;
    }

    const [row] = await sql<
      { created_at: Date; likes_received_count: number }[]
    >`SELECT created_at, likes_received_count FROM users WHERE id = ${user.id}`;

    if (!row) {
      await next();
      return;
    }

    const isNewAccount = Date.now() - row.created_at.getTime() < MS_24H;

    if (isNewAccount) {
      const [countRow] = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM rides
        WHERE driver_id = ${user.id} AND status = 'active'
      `;
      const activeCount = countRow?.count ?? 0;
      if (activeCount >= 1) {
        c.res = c.json({ error: "too_new" }, 403);
        return;
      }
    }

    if (row.likes_received_count === 0) {
      const [countRow] = await sql<{ count: number }[]>`
        SELECT COUNT(*)::int AS count FROM rides
        WHERE driver_id = ${user.id}
          AND created_at >= date_trunc('day', NOW())
      `;
      const dailyCount = countRow?.count ?? 0;
      if (dailyCount >= 3) {
        c.res = c.json({ error: "unverified_daily_limit" }, 403);
        return;
      }
    }

    await next();
  };
}
