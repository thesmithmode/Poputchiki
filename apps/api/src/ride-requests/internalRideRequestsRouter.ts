import { Hono } from "hono";
import type postgres from "postgres";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";
import { type Action, isDomainError, respondToRideRequest } from "./respond";

/**
 * Internal endpoint используется только webhook-сервисом для применения
 * accept/reject поступающих через callback_query из Telegram.
 *
 * Защита: X-Internal-Secret header сравнивается со shared secret из env.
 * tg_id из body → user.id через users.tg_id (с pgcrypto decrypt если нужно
 * — но tg_id хранится plaintext, см. db/migrations/001_users.sql).
 *
 * Не выставлять на публичный домен. В docker compose роут вешается на
 * loopback, доступен только по docker-network имени api:PORT.
 */
export function createInternalRideRequestsRouter(sql: postgres.Sql, internalSecret: string): Hono {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const got = c.req.header("x-internal-secret");
    if (!got || got !== internalSecret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });

  for (const action of ["accept", "reject", "cancel"] as Action[]) {
    app.post(`/:id/${action}`, async (c) => {
      const requestId = c.req.param("id");
      if (!UUID_RE.test(requestId)) return c.json({ error: "invalid id" }, 400);

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

      const [userRow] = await sql<
        {
          id: string;
          role: string;
          is_banned: boolean;
          ban_reason: string | null;
          banned_at: string | null;
          deleted_at: string | null;
        }[]
      >`
        SELECT id, role, is_banned, ban_reason, banned_at::text, deleted_at::text
        FROM users
        WHERE tg_id = ${tgId}
      `;
      if (!userRow) return c.json({ error: "user_not_found" }, 404);
      if (userRow.deleted_at) return c.json({ error: "unauthorized" }, 401);
      if (userRow.is_banned) {
        return c.json(
          { error: "banned", reason: userRow.ban_reason, banned_at: userRow.banned_at },
          403,
        );
      }

      const user: AppUser = {
        id: userRow.id,
        tgId,
        role: userRow.role as AppUser["role"],
      };

      try {
        const result = await respondToRideRequest(sql, user, requestId, action);

        // Кнопки в in-app EventsScreen должны исчезнуть без перезагрузки
        sql`
          UPDATE user_notifications SET is_read = true
          WHERE data->>'request_id' = ${requestId} AND is_read = false
        `.catch(() => {});

        return c.json({
          id: result.request.id,
          status: result.request.status,
          seat_refunded: result.refunded,
        });
      } catch (err) {
        if (isDomainError(err)) {
          if (err.code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
          if (err.code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
          if (err.code === "NO_SEATS") return c.json({ error: "no_seats" }, 409);
          return c.json({ error: "invalid_state", message: err.message }, 409);
        }
        /* c8 ignore next -- defensive */
        throw err;
      }
    });
  }

  return app;
}
