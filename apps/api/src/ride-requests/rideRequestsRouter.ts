import { Hono } from "hono";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";
import { type Action, isDomainError, respondToRideRequest } from "./respond";

export function createRideRequestsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/mine", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<{ ride_id: string; status: string }[]>`
        SELECT ride_id, status FROM ride_requests
        WHERE passenger_id = ${user.id}::uuid
          AND status IN ('pending', 'accepted')
        ORDER BY created_at DESC
        LIMIT 200
      `;
    });
    return c.json({ requests: rows });
  });

  for (const action of ["accept", "reject", "cancel"] as Action[]) {
    app.post(`/:id/${action}`, async (c) => {
      const user = c.get("user" as never) as AppUser;
      const requestId = c.req.param("id");
      if (!UUID_RE.test(requestId)) return c.json({ error: "invalid id" }, 400);

      try {
        const result = await respondToRideRequest(sql, user, requestId, action);
        return c.json({
          id: result.request.id,
          ride_id: result.request.ride_id,
          passenger_id: result.request.passenger_id,
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
        /* c8 ignore next -- defensive: re-throw unknown errors */
        throw err;
      }
    });
  }

  return app;
}
