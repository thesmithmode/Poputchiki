import { Hono } from "hono";
import type postgres from "postgres";
import { withSystem } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

export function createAdminNotificationsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const user = c.get("user" as never) as AppUser | undefined;
    if (!user || user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    return next();
  });

  app.get("/dlq", async (c) => {
    const data = await withSystem(sql, async (tx) => {
      const [counts] = await tx<{ pending: string; dead: string }[]>`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'dead') AS dead
        FROM notification_dlq
      `;
      const topCategories = await tx<{ category: string; count: string }[]>`
        SELECT category, COUNT(*) AS count
        FROM notification_dlq
        WHERE status = 'pending'
        GROUP BY category
        ORDER BY count DESC
        LIMIT 10
      `;
      const [oldest] = await tx<{ oldest_pending: string | null }[]>`
        SELECT MIN(next_retry_at)::text AS oldest_pending
        FROM notification_dlq
        WHERE status = 'pending'
      `;
      return { counts, topCategories, oldest };
    });

    return c.json({
      pending: Number(data.counts?.pending ?? 0),
      dead: Number(data.counts?.dead ?? 0),
      top_categories: data.topCategories.map((r) => ({
        category: r.category,
        count: Number(r.count),
      })),
      oldest_pending: data.oldest?.oldest_pending ?? null,
    });
  });

  return app;
}
