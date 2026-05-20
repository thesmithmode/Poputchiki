import { CreateReviewInput, enqueueNotification } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

interface ReviewRow {
  id: string;
  ride_id: string;
  subject_id: string;
  target_id: string;
  stars: number;
  text: string | null;
  created_at: Date;
}

export function createReviewsRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = CreateReviewInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const { ride_id, target_id, stars, body: text } = parsed.data;
    if (target_id === user.id) return c.json({ error: "cannot review self" }, 422);

    try {
      const result = await withIdentity(sql, user, async (tx) => {
        const confirmed = await tx<{ ok: number }[]>`
          SELECT 1 AS ok
          FROM ride_participation rp
          JOIN rides r ON r.id = rp.ride_id
          WHERE rp.ride_id = ${ride_id}
            AND rp.driver_marked = true
            AND rp.passenger_confirmed = true
            AND (
              (rp.passenger_id = ${user.id} AND r.driver_id = ${target_id})
              OR (rp.passenger_id = ${target_id} AND r.driver_id = ${user.id})
            )
          LIMIT 1
        `;
        if (confirmed.length === 0) return { kind: "forbidden" as const };

        const inserted = await tx<ReviewRow[]>`
          INSERT INTO reviews (ride_id, subject_id, target_id, stars, text)
          VALUES (${ride_id}, ${user.id}, ${target_id}, ${stars}, ${text ?? null})
          RETURNING id, ride_id, subject_id, target_id, stars, text, created_at
        `;
        return { kind: "created" as const, row: inserted[0] };
      });

      if (result.kind === "forbidden") return c.json({ error: "not_confirmed" }, 403);

      // Feed row + TG push to reviewed user
      if (result.row) {
        enqueueNotification(sql, {
          userId: target_id,
          category: "review_received",
          rideId: ride_id,
          data: { from_user_id: user.id, review_id: result.row.id, stars },
        }).catch(/* c8 ignore next -- fire-and-forget */ () => {});
      }

      return c.json(result.row, 201);
    } catch (err) {
      /* c8 ignore next -- unique violation is tested in integration; unit mock can't reproduce it */
      if (isUniqueViolation(err)) return c.json({ error: "already_reviewed" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }
  });

  app.get("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const driverId = c.req.query("driver_id");
    if (!driverId || !UUID_RE.test(driverId)) return c.json({ error: "invalid driver_id" }, 422);

    const rawLimit = Number(c.req.query("limit") ?? "20");
    /* c8 ignore next -- NaN branches for rawLimit/rawOffset are defensive; covered by tests */
    const limit = Math.max(1, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 20));
    const rawOffset = Number(c.req.query("offset") ?? "0");
    /* c8 ignore next */
    const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<ReviewRow[]>`
        SELECT id, ride_id, subject_id, target_id, stars, text, created_at
        FROM reviews
        WHERE target_id = ${driverId}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    });
    return c.json(rows);
  });

  return app;
}
