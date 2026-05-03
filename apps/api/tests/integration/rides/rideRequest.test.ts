/**
 * Integration tests: POST /api/rides/:id/request — seat booking through app.book_seat().
 * Покрывает: happy path, no_seats, already_requested, invalid uuid, auth.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-request-integration";
const TEST_IP = "10.0.3.1";

const DRIVER = {
  id: "00000000-0000-4000-c000-200000000001",
  tgId: 9001,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-c000-200000000002",
  tgId: 9002,
  role: "user" as const,
};
const PASSENGER2 = {
  id: "00000000-0000-4000-c000-200000000003",
  tgId: 9003,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

async function makeToken(user: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(user.tgId),
      uid: user.id,
      role: user.role,
      typ: "access",
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeApp() {
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.set("socketIp" as never, "172.20.0.2");
    await next();
  });
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.use("/api/*", rateLimit(sql, { userLimit: 1000, ipLimit: 1000 }));
  app.use("/api/*", auditLog(sql));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

async function seedRide(seatsTotal: number, seatsTaken = 0): Promise<string> {
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55.0, 37.0, 'B', 56.0, 38.0,
         NOW() + INTERVAL '3 hours', ${seatsTotal}, ${seatsTaken}, 'active')
      RETURNING id
    `;
    return String(row?.id);
  });
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    for (const u of [DRIVER, PASSENGER, PASSENGER2]) {
      await tx`
        INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
        VALUES (${u.id}, ${u.tgId}, 'U', 5, NOW() - INTERVAL '2 days')
        ON CONFLICT (tg_id) DO UPDATE SET likes_received_count = 5
      `;
    }
  });
});

afterEach(async () => {
  await sql`DELETE FROM ride_requests WHERE passenger_id IN (${PASSENGER.id}, ${PASSENGER2.id})`;
  await sql`DELETE FROM audit_log WHERE user_id IN (${DRIVER.id}, ${PASSENGER.id}, ${PASSENGER2.id})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE 'user:%'`;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${PASSENGER2.id})`;
  await sql.end();
});

describe("POST /api/rides/:id/request — happy path", () => {
  it("books seat → 201, ride_request inserted, seats_taken+1", async () => {
    const rideId = await seedRide(2, 0);
    const app = makeApp();
    const token = await makeToken(PASSENGER);

    const res = await app.request(`/api/rides/${rideId}/request`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${PASSENGER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });

    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.passenger_id).toBe(PASSENGER.id);
    expect(body.ride_id).toBe(rideId);

    const [ride] = await sql`SELECT seats_taken FROM rides WHERE id = ${rideId}`;
    expect(Number(ride?.seats_taken)).toBe(1);
  });
});

describe("POST /api/rides/:id/request — error cases", () => {
  it("invalid UUID format → 400", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/rides/not-a-uuid/request", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${PASSENGER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(400);
  });

  it("ride с заполненными местами → 409 no_seats", async () => {
    const rideId = await seedRide(1, 1); // full
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${rideId}/request`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${PASSENGER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("no_seats");
  });

  it("несуществующий ride → 409 no_seats (book_seat вернёт 0 rows)", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const fakeId = "00000000-0000-4000-d000-000000000999";
    const res = await app.request(`/api/rides/${fakeId}/request`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${PASSENGER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(409);
  });

  it("повторная заявка от того же passenger → 409 already_requested", async () => {
    const rideId = await seedRide(5, 0);
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const headers = {
      Authorization: `Bearer ${token}`,
      Cookie: `tg_uid=${PASSENGER.tgId}`,
      "X-Forwarded-For": TEST_IP,
    };
    const r1 = await app.request(`/api/rides/${rideId}/request`, { method: "POST", headers });
    expect(r1.status).toBe(201);
    const r2 = await app.request(`/api/rides/${rideId}/request`, { method: "POST", headers });
    expect(r2.status).toBe(409);
    const body = await readJson(r2);
    expect(body.error).toBe("already_requested");
  });

  it("без auth → 401", async () => {
    const rideId = await seedRide(2, 0);
    const app = makeApp();
    const res = await app.request(`/api/rides/${rideId}/request`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
