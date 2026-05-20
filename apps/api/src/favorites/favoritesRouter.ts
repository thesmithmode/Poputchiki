import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import { UUID_RE } from "../lib/uuid";
import type { AppUser } from "../middleware/identity-guard";

const PostFavoriteInput = z.object({
  target_id: z.string().regex(UUID_RE, "invalid uuid"),
});

const PatchFavoriteInput = z.object({
  notify: z.boolean(),
});

export function createFavoritesRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostFavoriteInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const { target_id } = parsed.data;
    if (target_id === user.id) return c.json({ error: "cannot favorite self" }, 422);

    try {
      const rows = await withIdentity(sql, user, async (tx) => {
        return tx<{ user_id: string; target_id: string; notify: boolean; created_at: Date }[]>`
          INSERT INTO favorites (user_id, target_id)
          VALUES (${user.id}, ${target_id})
          RETURNING user_id, target_id, notify, created_at
        `;
      });
      return c.json(rows[0], 201);
    } catch (err) {
      if (isUniqueViolation(err)) return c.json({ error: "already_favorited" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }
  });

  app.get("/me", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          target_id: string;
          notify: boolean;
          created_at: Date;
          display_name: string;
          tg_username: string | null;
          avatar_url: string | null;
          likes_received_count: number;
          avg_stars: number | null;
          reviews_count: number;
        }[]
      >`
        SELECT f.target_id, f.notify, f.created_at,
               u.display_name, u.tg_username, u.avatar_url,
               u.likes_received_count, u.avg_stars, u.reviews_count
        FROM favorites f
        JOIN users u ON u.id = f.target_id
        WHERE f.user_id = ${user.id}
        ORDER BY f.created_at DESC
      `;
    });
    return c.json(rows);
  });

  app.patch("/:target_id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const targetId = c.req.param("target_id");
    if (!UUID_RE.test(targetId)) return c.json({ error: "invalid id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PatchFavoriteInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<{ user_id: string; target_id: string; notify: boolean }[]>`
        UPDATE favorites SET notify = ${parsed.data.notify}
        WHERE user_id = ${user.id} AND target_id = ${targetId}
        RETURNING user_id, target_id, notify
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json(rows[0], 200);
  });

  app.delete("/:target_id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const targetId = c.req.param("target_id");
    if (!UUID_RE.test(targetId)) return c.json({ error: "invalid id" }, 400);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`
        DELETE FROM favorites
        WHERE user_id = ${user.id} AND target_id = ${targetId}
        RETURNING user_id
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return new Response(null, { status: 204 });
  });

  return app;
}
