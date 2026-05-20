import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
/**
 * Integration tests: GET /api/rides/:id against real Postgres.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-getride-integration";
const TEST_IP = "10.0.9.1";

const DRIVER = {
  id: "00000000-0000-4000-c000-d00000000001",
  tgId: 19001,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-c000-d00000000002",
  tgId: 19002,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;
let rideId: string;

async function makeToken(user: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(user.tgId),
      uid: user.id,
      role: user.role,
      typ: "access",
      jti: crypto.randomUUID(),
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
  app.use("/api/*", rateLimit(sql, { userLimit: 500, ipLimit: 5000 }));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());

  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Test Driver', 3, NOW() - INTERVAL '60 days'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Test Passenger', 1, NOW() - INTERVAL '30 days')
      ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
    `;
  });

  const rows = await sql`
    INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total, price_rub)
    VALUES (${DRIVER.id}, 'ЖК Царёво', 55.75, 37.61, 'ул. Баумана', 55.8, 37.65, NOW() + INTERVAL '2 hours', 3, 150)
    RETURNING id
  `;
  rideId = (rows[0] as { id: string }).id;

  // Insert accepted ride request for passenger
  await sql`
    INSERT INTO ride_requests (ride_id, passenger_id, status)
    VALUES (${rideId}, ${PASSENGER.id}, 'accepted')
  `;
});

afterAll(async () => {
  await sql`DELETE FROM ride_requests WHERE ride_id = ${rideId}`;
  await sql`DELETE FROM rides WHERE id = ${rideId}`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id})`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`}`;
  await sql.end();
});

describe("GET /api/rides/:id", () => {
  it("existing ride → 200 with driver and passengers", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(`/api/rides/${rideId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(rideId);
    expect(body.driver).toBeDefined();
    expect(body.driver.id).toBe(DRIVER.id);
    expect(body.driver.tg_id).toBe(DRIVER.tgId);
    expect(Array.isArray(body.passengers)).toBe(true);
    expect(body.passengers).toHaveLength(1);
    expect(body.passengers[0].id).toBe(PASSENGER.id);
  });

  it("invalid UUID → 422", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/rides/not-a-valid-uuid", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(422);
  });

  it("nonexistent UUID → 404", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/rides/00000000-0000-4000-c000-000000000000", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not found");
  });

  it("price_rub returned correctly", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${rideId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.price_rub).toBe(150);
  });

  it("M2: pending_requests видны только водителю, не пассажирам", async () => {
    // Создаём pending ride_request от третьего юзера — должен показаться driver'у, не PASSENGER'у
    const THIRD_TG = 4404;
    const thirdId = "00000000-0000-4000-d000-000000000099";
    await withSystem(sql, async (tx) => {
      await tx`
        INSERT INTO users (id, tg_id, display_name, created_at)
        VALUES (${thirdId}, ${THIRD_TG}, 'Third Passenger', NOW())
        ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name
      `;
    });
    await sql`
      INSERT INTO ride_requests (ride_id, passenger_id, status)
      VALUES (${rideId}, ${thirdId}, 'pending')
    `;
    try {
      const app = makeApp();
      // Driver видит pending_requests
      const driverToken = await makeToken(DRIVER);
      const driverRes = await app.request(`/api/rides/${rideId}`, {
        headers: {
          Authorization: `Bearer ${driverToken}`,
          Cookie: `sess_bind=${sessBind(JWT_SECRET, driverToken)}`,
          "X-Forwarded-For": TEST_IP,
        },
      });
      expect(driverRes.status).toBe(200);
      const driverBody = await readJson(driverRes);
      expect(Array.isArray(driverBody.pending_requests)).toBe(true);
      expect(driverBody.pending_requests.length).toBeGreaterThanOrEqual(1);

      // Пассажир НЕ видит pending_requests (privacy: чужие претенденты не его дело)
      const passengerToken = await makeToken(PASSENGER);
      const passengerRes = await app.request(`/api/rides/${rideId}`, {
        headers: {
          Authorization: `Bearer ${passengerToken}`,
          Cookie: `sess_bind=${sessBind(JWT_SECRET, passengerToken)}`,
          "X-Forwarded-For": TEST_IP,
        },
      });
      expect(passengerRes.status).toBe(200);
      const passengerBody = await readJson(passengerRes);
      expect(passengerBody.pending_requests).toEqual([]);
    } finally {
      await sql`DELETE FROM ride_requests WHERE passenger_id = ${thirdId}`;
      await sql`DELETE FROM users WHERE id = ${thirdId}`;
    }
  });
});
