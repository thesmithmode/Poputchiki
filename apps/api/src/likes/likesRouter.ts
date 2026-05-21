import { enqueueNotification } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;

const PostLikeInput = z.object({
  ride_id: z.string().regex(UUID_RE, "invalid ride_id"),
  target_user_id: z.string().regex(UUID_RE, "invalid target_user_id"),
});

export function createLikesRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostLikeInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const { ride_id, target_user_id } = parsed.data;
    if (target_user_id === user.id) return c.json({ error: "cannot like self" }, 422);

    try {
      const result = await withIdentity(sql, user, async (tx) => {
        const confirmed = await tx<{ ok: boolean }[]>`
          SELECT 1 AS ok
          FROM ride_participation rp
          JOIN rides r ON r.id = rp.ride_id
          WHERE rp.ride_id = ${ride_id}
            AND rp.driver_marked = true
            AND rp.passenger_confirmed = true
            AND (
              (rp.passenger_id = ${user.id} AND r.driver_id = ${target_user_id})
              OR (rp.passenger_id = ${target_user_id} AND r.driver_id = ${user.id})
            )
          LIMIT 1
        `;
        if (confirmed.length === 0) return { kind: "forbidden" as const };

        const inserted = await tx<
          { id: string; subject_id: string; target_id: string; ride_id: string; created_at: Date }[]
        >`
          INSERT INTO likes (subject_id, target_id, ride_id)
          VALUES (${user.id}, ${target_user_id}, ${ride_id})
          RETURNING id, subject_id, target_id, ride_id, created_at
        `;
        return { kind: "created" as const, row: inserted[0] };
      });

      if (result.kind === "forbidden") return c.json({ error: "not_confirmed" }, 403);

      // Feed row + TG push to liked user
      if (result.row) {
        enqueueNotification(sql, {
          userId: target_user_id,
          category: "like_received",
          rideId: ride_id,
          data: {
            from_user_id: user.id,
            like_id: result.row.id,
            liker_name: user.displayName ?? "",
          },
        }).catch(/* c8 ignore next -- fire-and-forget */ () => {});
      }

      return c.json(result.row, 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: "already_liked" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }
  });

  app.delete("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const result = await withIdentity(sql, user, async (tx) => {
      const found = await tx<{ created_at: Date }[]>`
        SELECT created_at FROM likes WHERE id = ${id} AND subject_id = ${user.id}
      `;
      const row = found[0];
      if (!row) return { kind: "not_found" as const };
      const ageMs = Date.now() - row.created_at.getTime();
      if (ageMs > DELETE_WINDOW_MS) return { kind: "expired" as const };
      await tx`DELETE FROM likes WHERE id = ${id} AND subject_id = ${user.id}`;
      return { kind: "deleted" as const };
    });

    if (result.kind === "not_found") return c.json({ error: "not_found" }, 404);
    if (result.kind === "expired") return c.json({ error: "delete_window_expired" }, 410);
    return new Response(null, { status: 204 });
  });

  return app;
}
