import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { UUID_RE } from "../lib/uuid";
import { antiBot } from "../middleware/anti-bot";
import type { AppUser } from "../middleware/identity-guard";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const Lat = z.number().gte(-90).lte(90);
const Lng = z.number().gte(-180).lte(180);

const PostInput = z.object({
  from_label: z.string().min(1).max(120),
  from_lat: Lat,
  from_lng: Lng,
  to_label: z.string().min(1).max(120),
  to_lat: Lat,
  to_lng: Lng,
  departure_time: z.string().regex(TIME_RE, "HH:MM expected"),
  weekdays: z.array(z.number().int().gte(0).lte(6)).min(1).max(7),
  price_rub: z.number().int().positive().optional(),
  seats_total: z.number().int().gte(1).lte(100),
  comment: z.string().max(200).optional(),
  active_from: z.string().optional(),
  active_to: z.string().optional(),
});

const PatchInput = z
  .object({
    from_label: z.string().min(1).max(120).optional(),
    from_lat: Lat.optional(),
    from_lng: Lng.optional(),
    to_label: z.string().min(1).max(120).optional(),
    to_lat: Lat.optional(),
    to_lng: Lng.optional(),
    departure_time: z.string().regex(TIME_RE).optional(),
    weekdays: z.array(z.number().int().gte(0).lte(6)).min(1).max(7).optional(),
    price_rub: z.number().int().positive().nullable().optional(),
    seats_total: z.number().int().gte(1).lte(100).optional(),
    comment: z.string().max(200).nullable().optional(),
    active_to: z.string().nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty body" });

type Row = {
  id: string;
  driver_id: string;
  from_label: string;
  from_lat: number;
  from_lng: number;
  to_label: string;
  to_lat: number;
  to_lng: number;
  departure_time: string;
  weekdays: number[];
  price_rub: number | null;
  seats_total: number;
  comment: string | null;
  active_from: string;
  active_to: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

// M11: статический список колонок для SELECT/RETURNING. Передаётся через
// `tx.unsafe(...)` потому что postgres.js sql-tag параметризует только values,
// не identifier'ы. Никогда не интерполировать пользовательский ввод в эту
// константу — это бы открыло SQL injection через unsafe.
const COLS_STATIC = `id, driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
  to_char(departure_time, 'HH24:MI') AS departure_time, weekdays,
  price_rub, seats_total, comment, active_from, active_to, is_active, created_at, updated_at`;

export function createRideTemplatesRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.post("/", antiBot(sql), async (c) => {
    const user = c.get("user" as never) as AppUser;
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PostInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);
    const d = parsed.data;

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<Row[]>`
        INSERT INTO ride_templates (
          driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
          departure_time, weekdays, price_rub, seats_total, comment,
          active_from, active_to
        ) VALUES (
          ${user.id}, ${d.from_label}, ${d.from_lat}, ${d.from_lng},
          ${d.to_label}, ${d.to_lat}, ${d.to_lng},
          ${d.departure_time}::time, ${d.weekdays as unknown as number[]},
          ${d.price_rub ?? null}, ${d.seats_total}, ${d.comment ?? null},
          COALESCE(${d.active_from ?? null}::date, current_date), ${d.active_to ?? null}::date
        )
        RETURNING ${tx.unsafe(COLS_STATIC)}
      `;
    });
    return c.json(rows[0], 201);
  });

  app.get("/me", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<Row[]>`
        SELECT ${tx.unsafe(COLS_STATIC)}
        FROM ride_templates
        WHERE driver_id = ${user.id} AND is_active = true
        ORDER BY created_at DESC
      `;
    });
    return c.json(rows);
  });

  app.patch("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      body = {};
    }
    const parsed = PatchInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "invalid input" }, 422);
    const p = parsed.data;

    const rows = await withIdentity(sql, user, async (tx) => {
      const exists = await tx<{ id: string }[]>`
        SELECT id FROM ride_templates WHERE id = ${id} AND driver_id = ${user.id}
      `;
      if (exists.length === 0) return [] as Row[];

      // H8: собираем простые поля в один UPDATE (вместо до 13 round-trip'ов).
      // Поля с явными cast'ами (departure_time::time, active_to::date) идут отдельно.
      // biome-ignore lint/suspicious/noExplicitAny: postgres.js tx(obj, ...keys) принимает Record<string, any>
      const updatable: Record<string, any> = {};
      if (p.from_label !== undefined) updatable.from_label = p.from_label;
      if (p.from_lat !== undefined) updatable.from_lat = p.from_lat;
      if (p.from_lng !== undefined) updatable.from_lng = p.from_lng;
      if (p.to_label !== undefined) updatable.to_label = p.to_label;
      if (p.to_lat !== undefined) updatable.to_lat = p.to_lat;
      if (p.to_lng !== undefined) updatable.to_lng = p.to_lng;
      if (p.weekdays !== undefined) updatable.weekdays = p.weekdays as unknown as number[];
      if (p.price_rub !== undefined) updatable.price_rub = p.price_rub;
      if (p.seats_total !== undefined) updatable.seats_total = p.seats_total;
      if (p.comment !== undefined) updatable.comment = p.comment;
      if (p.is_active !== undefined) updatable.is_active = p.is_active;

      const keys = Object.keys(updatable);
      if (keys.length > 0) {
        await tx`UPDATE ride_templates SET ${tx(updatable, ...keys)} WHERE id = ${id}`;
      }
      if (p.departure_time !== undefined)
        await tx`UPDATE ride_templates SET departure_time = ${p.departure_time}::time WHERE id = ${id}`;
      if (p.active_to !== undefined)
        await tx`UPDATE ride_templates SET active_to = ${p.active_to as string | null}::date WHERE id = ${id}`;

      return tx<Row[]>`
        SELECT ${tx.unsafe(COLS_STATIC)} FROM ride_templates WHERE id = ${id}
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json(rows[0], 200);
  });

  app.delete("/:id", async (c) => {
    const user = c.get("user" as never) as AppUser;
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "invalid id" }, 400);

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<{ id: string }[]>`
        UPDATE ride_templates SET is_active = false
        WHERE id = ${id} AND is_active = true
        RETURNING id
      `;
    });
    if (rows.length === 0) return c.json({ error: "not_found" }, 404);
    return new Response(null, { status: 204 });
  });

  return app;
}
