import { Hono } from "hono";
import type postgres from "postgres";
import { withIdentity } from "../db/with-identity";
import type { AppUser } from "../middleware/identity-guard";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MeRow {
  id: string;
  tg_id: string | number;
  tg_username: string | null;
  display_name: string;
  avatar_url: string | null;
  role: string;
  onboarded: boolean;
  notify_disabled: boolean;
  created_at: Date | string;
  last_seen_at: Date | string;
  rides_as_driver_completed: number | string | null;
  rides_as_passenger: number | string | null;
  likes_received: number | string | null;
  avg_stars: number | string | null;
  reviews_count: number | string | null;
}

function shapeMe(r: MeRow) {
  return {
    id: r.id,
    tg_id: typeof r.tg_id === "string" ? Number(r.tg_id) : r.tg_id,
    tg_username: r.tg_username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    role: r.role,
    onboarded: r.onboarded,
    notify_disabled: r.notify_disabled,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    last_seen_at: r.last_seen_at instanceof Date ? r.last_seen_at.toISOString() : r.last_seen_at,
    stats: {
      rides_as_driver_completed: Number(r.rides_as_driver_completed ?? 0),
      rides_as_passenger: Number(r.rides_as_passenger ?? 0),
      likes_received: Number(r.likes_received ?? 0),
      avg_stars: r.avg_stars === null ? null : Number(r.avg_stars),
      reviews_count: Number(r.reviews_count ?? 0),
    },
  };
}

interface PublicRow {
  id: string;
  tg_username: string | null;
  display_name: string;
  avatar_url: string | null;
  role: string;
  created_at: Date | string;
  rides_as_driver_completed: number | string | null;
  rides_as_passenger: number | string | null;
  likes_received: number | string | null;
  avg_stars: number | string | null;
  reviews_count: number | string | null;
}

function shapePublic(r: PublicRow) {
  return {
    id: r.id,
    tg_username: r.tg_username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    role: r.role,
    created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    stats: {
      rides_as_driver_completed: Number(r.rides_as_driver_completed ?? 0),
      rides_as_passenger: Number(r.rides_as_passenger ?? 0),
      likes_received: Number(r.likes_received ?? 0),
      avg_stars: r.avg_stars === null ? null : Number(r.avg_stars),
      reviews_count: Number(r.reviews_count ?? 0),
    },
  };
}

export function createUsersRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/me", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<MeRow[]>`
        SELECT u.id, u.tg_id, u.tg_username, u.display_name, u.avatar_url,
               u.role, u.onboarded, u.notify_disabled, u.created_at, u.last_seen_at,
               s.rides_as_driver_completed, s.rides_as_passenger,
               s.likes_received, s.avg_stars, s.reviews_count
        FROM users u
        LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.id = ${user.id} AND u.deleted_at IS NULL
      `;
    });
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json(shapeMe(rows[0] as MeRow));
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<PublicRow[]>`
        SELECT u.id, u.tg_username, u.display_name, u.avatar_url, u.role, u.created_at,
               s.rides_as_driver_completed, s.rides_as_passenger,
               s.likes_received, s.avg_stars, s.reviews_count
        FROM users u
        LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.id = ${id} AND u.deleted_at IS NULL AND u.is_banned = false
      `;
    });
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json(shapePublic(rows[0] as PublicRow));
  });

  return app;
}
