import { Hono } from "hono";
import type postgres from "postgres";
import { UUID_RE } from "../lib/uuid";
import { type SubAction, isDomainError, respondToSubscription } from "./respond";

/**
 * Internal endpoint используется только webhook-сервисом для применения
 * accept/reject подписок через callback_query из Telegram.
 *
 * Зеркало internalRideRequestsRouter — тот же security/auth pattern.
 */
export function createInternalTemplateSubscriptionsRouter(
  sql: postgres.Sql,
  internalSecret: string,
): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const got = c.req.header("x-internal-secret");
    if (!got || got !== internalSecret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });

  for (const action of ["accept", "reject"] as SubAction[]) {
    app.post(`/:id/${action}`, async (c) => {
      const subId = c.req.param("id");
      if (!UUID_RE.test(subId)) return c.json({ error: "invalid id" }, 400);

      let body: { tg_id?: number };
      try {
        body = await c.req.json<{ tg_id?: number }>();
      } catch {
        return c.json({ error: "invalid body" }, 400);
      }
      const tgId = body.tg_id;
      if (typeof tgId !== "number" || !Number.isFinite(tgId)) {
        return c.json({ error: "tg_id required" }, 400);
      }

      const [userRow] = await sql<{ id: string; role: string }[]>`
        SELECT id, role FROM users WHERE tg_id = ${tgId}
      `;
      if (!userRow) return c.json({ error: "user_not_found" }, 404);

      try {
        const result = await respondToSubscription(
          sql,
          { id: userRow.id, tgId, role: userRow.role as "user" | "admin" },
          subId,
          action,
        );

        // Кнопки в in-app EventsScreen должны исчезнуть без перезагрузки
        sql`
          UPDATE user_notifications SET is_read = true
          WHERE data->>'subscription_id' = ${subId} AND is_read = false
        `.catch(() => {});

        return c.json({ id: result.sub.id, status: result.sub.status });
      } catch (err) {
        if (isDomainError(err)) {
          if (err.code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
          if (err.code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
          return c.json({ error: "invalid_state" }, 409);
        }
        /* c8 ignore next -- defensive */
        throw err;
      }
    });
  }

  return app;
}
