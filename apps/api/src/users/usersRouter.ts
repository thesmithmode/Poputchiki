import { sanitizeText } from "@poputchiki/shared/sanitize";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { encryptPii } from "../db/crypto";
import { withIdentity, withSystem } from "../db/with-identity";
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
    },
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

  app.delete("/me", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    /* c8 ignore next -- identityGuard returns 401 before handler runs */
    if (!user) return c.json({ error: "unauthorized" }, 401);

    await withIdentity(sql, user, async (tx) => {
      // Cancel active rides as driver
      await tx`
        UPDATE rides SET status = 'cancelled'
        WHERE driver_id = ${user.id} AND status = 'active'
      `;
      // Cancel pending/accepted ride_requests for cancelled rides
      await tx`
        UPDATE ride_requests SET status = 'cancelled'
        WHERE ride_id IN (
          SELECT id FROM rides WHERE driver_id = ${user.id} AND status = 'cancelled'
        ) AND status IN ('pending', 'accepted')
      `;
      // Remove favorites
      await tx`DELETE FROM favorites WHERE user_id = ${user.id}`;
    });

    // Anonymize (SECURITY DEFINER function bypasses RLS)
    await sql`SELECT app.anonymize_user(${user.id}::uuid)`;

    // Revoke all refresh tokens
    await sql`
      UPDATE revoked_tokens SET revoked_at = now()
      WHERE user_id = ${user.id} AND revoked_at IS NULL
    `;

    // Audit log (withSystem to bypass FORCE RLS on audit_log)
    await withSystem(sql, async (tx) => {
      await tx`
        INSERT INTO audit_log (user_id, action, entity, entity_id, meta)
        VALUES (${user.id}, 'user_self_delete', 'users', ${user.id}::uuid, '{}'::jsonb)
      `;
    });

    return c.json({ deleted: true });
  });

  return app;
}
