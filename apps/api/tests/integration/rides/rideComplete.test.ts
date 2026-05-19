import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
/**
 * Integration: POST /api/rides/:id/complete
 * - driver-only, active → completed
 * - accepted passengers get ride_completed notification enqueued
 * - audit_log записывается
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-complete";

const DRIVER = {
  id: "00000000-0000-4000-d000-830000000001",
  tgId: 9830001,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-d000-830000000002",
  tgId: 9830002,
  role: "user" as const,
};
const STRANGER = {
  id: "00000000-0000-4000-d000-830000000003",
  tgId: 9830003,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(u.tgId),
      uid: u.id,
      role: u.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.use("/api/*", auditLog(sql));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` };
}

async function seedRide(status = "active"): Promise<string> {
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55, 49, 'B', 56, 50,
         NOW() - INTERVAL '1 hour', 2, 1, ${status})
      RETURNING id
    `;
    return String(row?.id);
  });
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Complete Driver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Complete Passenger'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'Complete Stranger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  const ids = [DRIVER.id, PASSENGER.id, STRANGER.id];
  await sql`DELETE FROM ride_requests WHERE passenger_id = ANY(${ids})`;
  await sql`DELETE FROM notification_queue WHERE user_id = ANY(${ids})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  await sql.end();
});

beforeEach(async () => {
  await sql`DELETE FROM ride_requests WHERE passenger_id = ANY(${[DRIVER.id, PASSENGER.id, STRANGER.id]})`;
  await sql`DELETE FROM notification_queue WHERE user_id = ANY(${[DRIVER.id, PASSENGER.id, STRANGER.id]})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
});

describe("POST /api/rides/:id/complete", () => {
  it("200 — driver completes active ride", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}/complete`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(rideId);
    expect(body.status).toBe("completed");

    const [ride] = await sql<{ status: string }[]>`SELECT status FROM rides WHERE id = ${rideId}`;
    expect(ride.status).toBe("completed");
  });

  it("audit_log записывается", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    await makeApp().request(`/api/rides/${rideId}/complete`, {
      method: "POST",
      headers: authHeaders(token),
    });

    const [log] = await sql<{ action: string }[]>`
      SELECT action FROM audit_log
      WHERE user_id = ${DRIVER.id} AND entity_id = ${rideId}::uuid
    `;
    expect(log?.action).toBe("ride_complete");
  });

  it("200 — с принятым пассажиром: уведомление ставится в очередь", async () => {
    const rideId = await seedRide();
    await withSystem(sql, async (tx) => {
      await tx`
        INSERT INTO ride_requests (ride_id, passenger_id, status)
        VALUES (${rideId}, ${PASSENGER.id}, 'accepted')
      `;
    });

    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}/complete`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));
    const [notif] = await sql<{ category: string }[]>`
      SELECT category FROM notification_queue
      WHERE user_id = ${PASSENGER.id} AND ride_id = ${rideId}::uuid
    `;
    expect(notif?.category).toBe("ride_completed");
  });

  it("400 — невалидный UUID", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request("/api/rides/not-a-uuid/complete", {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(400);
  });

  it("404 — поездка не найдена", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(
      "/api/rides/00000000-0000-4000-d000-999999999999/complete",
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
  });

  it("403 — не водитель поездки", async () => {
    const rideId = await seedRide();
    const token = await makeToken(STRANGER);
    const res = await makeApp().request(`/api/rides/${rideId}/complete`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(403);
  });

  it("401 — без авторизации", async () => {
    const rideId = await seedRide();
    const res = await makeApp().request(`/api/rides/${rideId}/complete`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
