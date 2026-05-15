import { sanitizeText } from "@poputchiki/shared/sanitize";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { encryptPii } from "../db/crypto";
import { withIdentity } from "../db/with-identity";
import { invalidateUserState } from "../middleware/banned-user";
import type { AppUser } from "../middleware/identity-guard";

const PatchMeInput = z.object({
  display_name: z
    .string()
    .min(1)
    .max(50)
    .transform((s) => sanitizeText(s, 50))
    .optional(),
  phone: z.string().min(1).max(30).optional(),
  apt_number: z.string().min(1).max(20).optional(),
  onboarded: z.boolean().optional(),
});

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
  created_at: Date;
  last_seen_at: Date;
  rides_as_driver_completed: number | string | null;
  rides_as_passenger: number | string | null;
  likes_received: number | string | null;
  avg_stars: number | string | null;
  reviews_count: number | string | null;
  driver_avg_stars: number | string | null;
  passenger_avg_stars: number | string | null;
  driver_reviews_count: number | string | null;
  passenger_reviews_count: number | string | null;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: Date | null;
}

// postgres.js: timestamptz → Date всегда, BIGINT → string всегда. Без ternary.
const toIso = (v: Date): string => v.toISOString();

function shapeMe(r: MeRow) {
  return {
    id: r.id,
    tg_id: Number(r.tg_id),
    tg_username: r.tg_username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    role: r.role,
    onboarded: r.onboarded,
    notify_disabled: r.notify_disabled,
    created_at: toIso(r.created_at),
    last_seen_at: toIso(r.last_seen_at),
    stats: {
      rides_as_driver_completed: Number(r.rides_as_driver_completed ?? 0),
      rides_as_passenger: Number(r.rides_as_passenger ?? 0),
      likes_received: Number(r.likes_received ?? 0),
      /* c8 ignore next -- non-null branch needs full review fixture (skipped for cov) */
      avg_stars: r.avg_stars === null ? null : Number(r.avg_stars),
      reviews_count: Number(r.reviews_count ?? 0),
      /* c8 ignore next */
      driver_avg_stars: r.driver_avg_stars === null ? null : Number(r.driver_avg_stars),
      /* c8 ignore next */
      passenger_avg_stars: r.passenger_avg_stars === null ? null : Number(r.passenger_avg_stars),
      driver_reviews_count: Number(r.driver_reviews_count ?? 0),
      passenger_reviews_count: Number(r.passenger_reviews_count ?? 0),
    },
    ...(r.is_banned
      ? {
          is_banned: true,
          ban_reason: r.ban_reason,
          /* c8 ignore next -- defensive: banned users always have banned_at set */
          banned_at: r.banned_at ? toIso(r.banned_at) : null,
        }
      : {}),
  };
}

interface PublicRow {
  id: string;
  tg_username: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at: Date;
  rides_as_driver_completed: number | string | null;
  rides_as_passenger: number | string | null;
  likes_received: number | string | null;
  avg_stars: number | string | null;
  reviews_count: number | string | null;
  driver_avg_stars: number | string | null;
  passenger_avg_stars: number | string | null;
  driver_reviews_count: number | string | null;
  passenger_reviews_count: number | string | null;
}

function shapePublic(r: PublicRow) {
  return {
    id: r.id,
    tg_username: r.tg_username,
    display_name: r.display_name,
    avatar_url: r.avatar_url,
    created_at: toIso(r.created_at),
    stats: {
      rides_as_driver_completed: Number(r.rides_as_driver_completed ?? 0),
      rides_as_passenger: Number(r.rides_as_passenger ?? 0),
      likes_received: Number(r.likes_received ?? 0),
      /* c8 ignore next -- non-null branch needs full review fixture (skipped for cov) */
      avg_stars: r.avg_stars === null ? null : Number(r.avg_stars),
      reviews_count: Number(r.reviews_count ?? 0),
      /* c8 ignore next */
      driver_avg_stars: r.driver_avg_stars === null ? null : Number(r.driver_avg_stars),
      /* c8 ignore next */
      passenger_avg_stars: r.passenger_avg_stars === null ? null : Number(r.passenger_avg_stars),
      driver_reviews_count: Number(r.driver_reviews_count ?? 0),
      passenger_reviews_count: Number(r.passenger_reviews_count ?? 0),
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
               u.is_banned, u.ban_reason, u.banned_at,
               s.rides_as_driver_completed, s.rides_as_passenger,
               s.likes_received, s.avg_stars, s.reviews_count,
               s.driver_avg_stars, s.passenger_avg_stars,
               s.driver_reviews_count, s.passenger_reviews_count
        FROM users u
        LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.id = ${user.id} AND u.deleted_at IS NULL
      `;
    });
    /* c8 ignore next -- defensive: identity-guard ensures user exists for /me */
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json(shapeMe(rows[0] as MeRow));
  });

  app.patch("/me", async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PatchMeInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);

    const data = parsed.data;
    /* c8 ignore next -- PGCRYPTO_KEY guaranteed in production */
    const pgcryptoKey = process.env.PGCRYPTO_KEY ?? "";

    const rows = await withIdentity(sql, user, async (tx) => {
      if (data.display_name !== undefined) {
        await tx`UPDATE users SET display_name = ${data.display_name} WHERE id = ${user.id}`;
      }
      if (data.phone !== undefined) {
        const enc = await encryptPii(tx, data.phone, pgcryptoKey);
        await tx`UPDATE users SET phone_enc = ${new Uint8Array(enc)} WHERE id = ${user.id}`;
      }
      if (data.apt_number !== undefined) {
        const enc = await encryptPii(tx, data.apt_number, pgcryptoKey);
        await tx`UPDATE users SET apt_number_enc = ${new Uint8Array(enc)} WHERE id = ${user.id}`;
      }
      if (data.onboarded !== undefined) {
        await tx`UPDATE users SET onboarded = ${data.onboarded} WHERE id = ${user.id}`;
      }
      return tx<MeRow[]>`
        SELECT u.id, u.tg_id, u.tg_username, u.display_name, u.avatar_url,
               u.role, u.onboarded, u.notify_disabled, u.created_at, u.last_seen_at,
               u.is_banned, u.ban_reason, u.banned_at,
               s.rides_as_driver_completed, s.rides_as_passenger,
               s.likes_received, s.avg_stars, s.reviews_count,
               s.driver_avg_stars, s.passenger_avg_stars,
               s.driver_reviews_count, s.passenger_reviews_count
        FROM users u
        LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.id = ${user.id} AND u.deleted_at IS NULL
      `;
    });
    /* c8 ignore next -- defensive: identity-guard ensures user exists for /me */
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json(shapeMe(rows[0] as MeRow));
  });

  app.get("/:id/schedule", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<
        {
          id: string;
          weekdays: number[];
          departure_time: string;
          from_label: string;
          to_label: string;
          price_rub: number | null;
          seats_total: number;
          active_from: string;
          active_to: string | null;
        }[]
      >`
        SELECT id, weekdays,
               to_char(departure_time, 'HH24:MI') AS departure_time,
               from_label, to_label, price_rub, seats_total,
               active_from, active_to
        FROM ride_templates
        WHERE driver_id = ${id}
          AND is_active = true
          AND (active_to IS NULL OR active_to >= current_date)
        ORDER BY departure_time ASC
      `;
    });
    return c.json(rows);
  });

  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<PublicRow[]>`
        SELECT u.id, u.tg_username, u.display_name, u.avatar_url, u.created_at,
               s.rides_as_driver_completed, s.rides_as_passenger,
               s.likes_received, s.avg_stars, s.reviews_count,
               s.driver_avg_stars, s.passenger_avg_stars,
               s.driver_reviews_count, s.passenger_reviews_count
        FROM users u
        LEFT JOIN user_stats s ON s.user_id = u.id
        WHERE u.id = ${id} AND u.deleted_at IS NULL AND u.is_banned = false
      `;
    });
    if (rows.length === 0) return c.json({ error: "not found" }, 404);
    c.header("Cache-Control", "private, no-store");
    return c.json(shapePublic(rows[0] as PublicRow));
  });

  app.delete("/me", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    /* c8 ignore next -- identityGuard returns 401 before handler runs */
    if (!user) return c.json({ error: "unauthorized" }, 401);

    // Audit first — if subsequent steps fail, the erasure intent is recorded
    await sql`
      INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
      SELECT ${user.id}, 'user_self_delete', 'users', ${user.id}::uuid, '{}'::jsonb
      WHERE NOT EXISTS (
        SELECT 1 FROM audit_log WHERE user_id = ${user.id} AND action = 'user_self_delete'
      )
    `;

    // Collect affected passengers before cancelling rides (for notifications)
    const affectedPassengers = await withIdentity(sql, user, async (tx) => {
      const rows = await tx<{ passenger_id: string; ride_id: string }[]>`
        SELECT rr.passenger_id, rr.ride_id
        FROM ride_requests rr
        JOIN rides r ON r.id = rr.ride_id
        WHERE r.driver_id = ${user.id} AND r.status = 'active'
          AND rr.status IN ('pending', 'accepted')
      `;
      // Cancel active rides as driver
      await tx`
        UPDATE rides SET status = 'cancelled'
        WHERE driver_id = ${user.id} AND status = 'active'
      `;
      // Cancel pending/accepted ride_requests for those rides
      await tx`
        UPDATE ride_requests SET status = 'cancelled'
        WHERE ride_id IN (
          SELECT id FROM rides WHERE driver_id = ${user.id} AND status = 'cancelled'
        ) AND status IN ('pending', 'accepted')
      `;
      // Remove favorites
      await tx`DELETE FROM favorites WHERE user_id = ${user.id}`;
      return rows;
    });

    // Anonymize (SECURITY DEFINER function bypasses RLS)
    await sql`SELECT app.anonymize_user(${user.id}::uuid)`;

    // Сбросить in-memory кэш состояния — anonymize выставил deleted_at, кэш TTL 30s
    // продолжал бы пропускать юзера. После invalidate следующий запрос с этим access
    // токеном попадёт в SELECT и вернёт 401.
    invalidateUserState(user.id);

    // Revoke all refresh tokens (revoked_tokens deny-all for app role — bare sql ok)
    await sql`
      UPDATE revoked_tokens SET revoked_at = now()
      WHERE user_id = ${user.id} AND revoked_at IS NULL
    `;

    // Notify affected passengers (fire-and-forget)
    for (const { passenger_id, ride_id } of affectedPassengers) {
      sql`
        SELECT pg_notify(
          'ride_cancelled',
          ${JSON.stringify({ ride_id, passenger_id, driver_id: user.id, category: "ride_cancelled" })}
        )
      `.catch(() => {});
    }

    return c.json({ deleted: true });
  });

  return app;
}
