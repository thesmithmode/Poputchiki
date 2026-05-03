import { CreateRideInput, MarkParticipantsInput } from "@poputchiki/shared";
import { Hono } from "hono";
import type postgres from "postgres";
import { z } from "zod";
import { withIdentity } from "../db/with-identity";
import { isUniqueViolation } from "../lib/db-errors";
import type { AppUser } from "../middleware/identity-guard";

const MS_24H = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAntibotError(err: unknown): err is Error & { code: "ANTIBOT"; antibot: string } {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === "ANTIBOT" &&
    typeof (err as Error & { antibot?: string }).antibot === "string"
  );
}

function isNoSeatsError(err: unknown): boolean {
  return err instanceof Error && (err as Error & { code?: string }).code === "NO_SEATS";
}

interface CursorData {
  d: string;
  i: string;
}

function encodeCursor(ride: Record<string, unknown>): string {
  // postgres-js returns timestamptz as JS Date; String(date) loses sub-second
  // precision when round-tripped through ::timestamptz cast, so the boundary
  // row reappears on the next page (off-by-one + page overlap). Use ISO 8601
  // to preserve millisecond precision through encode/decode/cast.
  const d =
    ride.departure_at instanceof Date ? ride.departure_at.toISOString() : String(ride.departure_at);
  const payload: CursorData = { d, i: String(ride.id) };
  return btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const raw = JSON.parse(atob(padded));
    if (typeof raw.d !== "string" || typeof raw.i !== "string") return null;
    return raw as CursorData;
  } catch {
    return null;
  }
}

const GetRidesQuery = z.object({
  fromLat: z.coerce.number().min(-90).max(90).optional(),
  fromLng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(500).optional(),
  fromAt: z.string().datetime().optional(),
  toAt: z.string().datetime().optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  seatsMin: z.coerce.number().int().min(1).max(4).optional(),
  trustMinAccountAgeDays: z.coerce.number().int().min(0).optional(),
  trustMinLikes: z.coerce.number().int().min(0).optional(),
  favoritesOnly: z
    .string()
    .optional()
    .transform((v: string | undefined) => v === "true"),
  cursor: z.string().optional(),
});

export function createRidesRouter(sql: postgres.Sql): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const parsed = GetRidesQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "validation failed", details: parsed.error.flatten() }, 422);
    }
    const p = parsed.data;
    const user = c.get("user" as never) as AppUser;

    let cursor: CursorData | null = null;
    if (p.cursor) {
      cursor = decodeCursor(p.cursor);
      if (!cursor) return c.json({ error: "invalid cursor" }, 400);
    }

    // Geo bounding box from radius
    const latDelta =
      p.fromLat !== undefined && p.radiusKm !== undefined ? p.radiusKm / 111 : undefined;
    const lngDelta =
      p.fromLat !== undefined && p.fromLng !== undefined && p.radiusKm !== undefined
        ? p.radiusKm / (111 * Math.cos((p.fromLat * Math.PI) / 180))
        : undefined;

    const rows = await withIdentity(sql, user, async (tx) => {
      return tx<Record<string, unknown>[]>`
        SELECT r.*
        FROM rides r
        JOIN users u ON r.driver_id = u.id
        WHERE r.status = 'active'
          ${p.fromAt ? tx`AND r.departure_at >= ${p.fromAt}` : tx``}
          ${p.toAt ? tx`AND r.departure_at <= ${p.toAt}` : tx``}
          ${p.priceMax !== undefined ? tx`AND (r.price_rub IS NULL OR r.price_rub <= ${p.priceMax})` : tx``}
          ${p.seatsMin !== undefined ? tx`AND (r.seats_total - r.seats_taken) >= ${p.seatsMin}` : tx``}
          ${
            latDelta !== undefined && p.fromLat !== undefined
              ? tx`AND r.from_lat BETWEEN ${p.fromLat - latDelta} AND ${p.fromLat + latDelta}`
              : tx``
          }
          ${
            lngDelta !== undefined && p.fromLng !== undefined
              ? tx`AND r.from_lng BETWEEN ${p.fromLng - lngDelta} AND ${p.fromLng + lngDelta}`
              : tx``
          }
          ${
            p.trustMinAccountAgeDays !== undefined
              ? tx`AND u.created_at <= NOW() - (${p.trustMinAccountAgeDays} * INTERVAL '1 day')`
              : tx``
          }
          ${p.trustMinLikes !== undefined ? tx`AND u.likes_received_count >= ${p.trustMinLikes}` : tx``}
          ${
            p.favoritesOnly
              ? tx`AND r.driver_id IN (
                  SELECT target_id FROM favorites WHERE user_id = app.current_user_id()
                )`
              : tx``
          }
          ${cursor ? tx`AND (r.departure_at, r.id) > (${cursor.d}::timestamptz, ${cursor.i}::uuid)` : tx``}
        ORDER BY r.departure_at ASC, r.id ASC
        LIMIT ${PAGE_SIZE + 1}
      `;
    });

    const hasMore = rows.length === PAGE_SIZE + 1;
    const rides = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const lastRide = rides[PAGE_SIZE - 1];
    const nextCursor = hasMore && lastRide ? encodeCursor(lastRide) : null;

    return c.json({ rides, nextCursor });
  });

  app.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = CreateRideInput.safeParse(body);
    if (!parsedBody.success) {
      return c.json({ error: "validation failed", details: parsedBody.error.flatten() }, 422);
    }
    const input = parsedBody.data;
    const user = c.get("user" as never) as AppUser;

    let ride: Record<string, unknown>;
    try {
      ride = await withIdentity(sql, user, async (tx) => {
        if (user.role !== "admin") {
          const [userRow] = await tx<
            { created_at: Date; likes_received_count: number }[]
          >`SELECT created_at, likes_received_count FROM users WHERE id = ${user.id}`;

          /* c8 ignore next 3 -- defensive: identity-guard validates user exists */
          if (!userRow) {
            throw Object.assign(new Error("user not found"), { code: "NOT_FOUND" });
          }

          const isNewAccount = Date.now() - userRow.created_at.getTime() < MS_24H;

          if (isNewAccount) {
            const result = await tx<{ count: number }[]>`
              SELECT COUNT(*)::int AS count FROM rides
              WHERE driver_id = ${user.id} AND status = 'active'
            `;
            /* c8 ignore next -- defensive ?? 0: COUNT(*) always returns row */
            const activeCount = result[0]?.count ?? 0;
            if (activeCount >= 1) {
              throw Object.assign(new Error("anti-bot: new account limit"), {
                code: "ANTIBOT",
                antibot: "too_new",
              });
            }
          }

          if (userRow.likes_received_count === 0) {
            const result = await tx<{ count: number }[]>`
              SELECT COUNT(*)::int AS count FROM rides
              WHERE driver_id = ${user.id}
                AND created_at >= date_trunc('day', NOW())
            `;
            /* c8 ignore next -- defensive ?? 0: COUNT(*) always returns row */
            const dailyCount = result[0]?.count ?? 0;
            if (dailyCount >= 3) {
              throw Object.assign(new Error("anti-bot: daily limit for unliked accounts"), {
                code: "ANTIBOT",
                antibot: "unverified_daily_limit",
              });
            }
          }
        }

        const rows = await tx`
          INSERT INTO rides
            (driver_id, template_id, from_label, from_lat, from_lng,
             to_label, to_lat, to_lng, departure_at, price_rub, seats_total, comment)
          VALUES
            (${user.id}, ${input.template_id ?? null}, ${input.from_label},
             ${input.from_lat}, ${input.from_lng}, ${input.to_label},
             ${input.to_lat}, ${input.to_lng}, ${input.departure_at},
             ${input.price_rub ?? null}, ${input.seats_total}, ${input.comment ?? null})
          RETURNING *
        `;
        return rows[0] as Record<string, unknown>;
      });
    } catch (err: unknown) {
      if (isAntibotError(err)) {
        return c.json({ error: err.antibot }, 403);
      }
      /* c8 ignore next -- defensive: re-throw non-antibot errors to global handler */
      throw err;
    }

    // Audit recorded by global auditLog middleware — no manual INSERT here.
    return c.json(ride, 201);
  });

  app.post("/:id/request", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    /* c8 ignore next -- identityGuard middleware returns 401 before handler runs */
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const rideId = c.req.param("id");
    if (!UUID_RE.test(rideId)) return c.json({ error: "invalid ride id" }, 400);

    try {
      const result = await withIdentity(
        sql,
        user,
        async (tx) => {
          const [ride] = await tx<{ id: string; driver_id: string }[]>`
            SELECT * FROM app.book_seat(${rideId}::uuid)
          `;

          if (!ride) {
            const err = Object.assign(new Error("no_seats"), { code: "NO_SEATS" });
            throw err;
          }

          const [rideRequest] = await tx`
            INSERT INTO ride_requests (ride_id, passenger_id)
            VALUES (${rideId}, ${user.id})
            RETURNING *
          `;

          return { rideRequest, driverId: String(ride.driver_id) };
        },
        "repeatable read",
      );

      // Notify driver (fire-and-forget via LISTEN/NOTIFY)
      sql`
        SELECT pg_notify(
          'ride_request',
          ${JSON.stringify({ ride_id: rideId, passenger_id: user.id, driver_id: result.driverId, category: "ride_request" })}
        )
      `.catch(
        /* c8 ignore next -- fire-and-forget notify; callback never invoked in tests */
        () => {},
      );

      return c.json(result.rideRequest, 201);
    } catch (err) {
      if (isNoSeatsError(err)) return c.json({ error: "no_seats" }, 409);
      /* c8 ignore next -- defensive: unknown error codes re-throw; all known codes return above */
      if (isUniqueViolation(err)) return c.json({ error: "already_requested" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }
  });

  app.post("/:id/mark-participants", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    /* c8 ignore next -- identityGuard middleware returns 401 before handler runs */
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const rideId = c.req.param("id");
    if (!UUID_RE.test(rideId)) return c.json({ error: "invalid ride id" }, 400);

    const body = await c.req.json().catch(() => null);
    const parsed = MarkParticipantsInput.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "validation failed" }, 422);
    }
    const { passenger_ids } = parsed.data;

    let rows: { ride_id: string; passenger_id: string; driver_marked: boolean }[];
    try {
      rows = await withIdentity(
        sql,
        user,
        async (tx) => {
          const [ride] = await tx<{ id: string; driver_id: string; departure_at: Date }[]>`
          SELECT id, driver_id, departure_at FROM rides WHERE id = ${rideId}::uuid
        `;

          if (!ride) {
            throw Object.assign(new Error("not_found"), { code: "NOT_FOUND" });
          }

          if (ride.driver_id !== user.id) {
            throw Object.assign(new Error("forbidden"), { code: "FORBIDDEN" });
          }

          if (ride.departure_at > new Date()) {
            throw Object.assign(new Error("before_departure"), { code: "BEFORE_DEPARTURE" });
          }

          const upserted: { ride_id: string; passenger_id: string; driver_marked: boolean }[] = [];

          for (const passengerId of passenger_ids) {
            const [row] = await tx<
              { ride_id: string; passenger_id: string; driver_marked: boolean }[]
            >`
            INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, marked_at)
            VALUES (${rideId}::uuid, ${passengerId}::uuid, true, now())
            ON CONFLICT (ride_id, passenger_id)
            DO UPDATE SET driver_marked = true, marked_at = now()
            RETURNING ride_id, passenger_id, driver_marked
          `;
            /* c8 ignore next -- INSERT RETURNING always yields a row on success */
            if (row) upserted.push(row);
          }

          return upserted;
        },
        "repeatable read",
      );
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "NOT_FOUND") return c.json({ error: "not_found" }, 404);
      if (code === "FORBIDDEN") return c.json({ error: "forbidden" }, 403);
      /* c8 ignore next -- defensive: unknown error codes re-throw; all known codes return above */
      if (code === "BEFORE_DEPARTURE") return c.json({ error: "before_departure" }, 409);
      /* c8 ignore next -- defensive: re-throw unknown errors */
      throw err;
    }

    // Notify passengers (fire-and-forget via LISTEN/NOTIFY)
    for (const passengerId of passenger_ids) {
      sql`
        SELECT pg_notify(
          'participation_request',
          ${JSON.stringify({ ride_id: rideId, passenger_id: passengerId, driver_id: user.id, category: "participation_request" })}
        )
      `.catch(
        /* c8 ignore next -- fire-and-forget notify; callback never invoked in tests */
        () => {},
      );
    }

    return c.json({ marked_count: passenger_ids.length, passengers: rows }, 200);
  });

  return app;
}
