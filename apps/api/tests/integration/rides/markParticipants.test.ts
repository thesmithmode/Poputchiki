/**
 * Integration tests: POST /api/rides/:id/mark-participants — mark attending passengers after departure.
 * Покрывает: happy path, not_driver, before_departure, no_auth, invalid_body (non-UUID, empty array).
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

const JWT_SECRET = "test-secret-mark-participants-integration";
const TEST_IP = "10.0.3.2";

const DRIVER = {
  id: "00000000-0000-4000-b000-700000000001",
  tgId: 70001,
  role: "user" as const,
};
const PASSENGER_A = {
  id: "00000000-0000-4000-b000-700000000002",
  tgId: 70002,
  role: "user" as const,
};
const PASSENGER_B = {
  id: "00000000-0000-4000-b000-700000000003",
  tgId: 70003,
  role: "user" as const,
};
const OTHER_USER = {
  id: "00000000-0000-4000-b000-700000000004",
  tgId: 70004,
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
    c.set("socketIp" as never, TEST_IP);
    await next();
  });
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.use("/api/*", rateLimit(sql, { userLimit: 1000, ipLimit: 1000 }));
  app.use("/api/*", auditLog(sql));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

async function seedRide(
  departure_at: Date = new Date(Date.now() - 3600000), // past by default
): Promise<string> {
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55.0, 37.0, 'B', 56.0, 38.0,
         ${departure_at}, 2, 0, 'active')
      RETURNING id
    `;
    return String(row?.id);
  });
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    for (const u of [DRIVER, PASSENGER_A, PASSENGER_B, OTHER_USER]) {
      await tx`
        INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
        VALUES (${u.id}, ${u.tgId}, 'U', 5, NOW() - INTERVAL '2 days')
        ON CONFLICT (tg_id) DO UPDATE SET likes_received_count = 5
      `;
    }
  });
});

afterEach(async () => {
  await sql`DELETE FROM ride_participation WHERE ride_id IN (SELECT id FROM rides WHERE driver_id = ${DRIVER.id})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id IN (${DRIVER.id}, ${PASSENGER_A.id}, ${PASSENGER_B.id}, ${OTHER_USER.id})`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE 'user:%'`;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER_A.id}, ${PASSENGER_B.id}, ${OTHER_USER.id})`;
  await sql.end();
});

describe("POST /api/rides/:id/mark-participants — happy path", () => {
  it("driver marks passengers after departure → 200, ride_participation rows created with driver_marked=true", async () => {
    const rideId = await seedRide(new Date(Date.now() - 3600000)); // 1 hour ago
    const app = makeApp();
    const token = await makeToken(DRIVER);

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({
        passenger_ids: [PASSENGER_A.id, PASSENGER_B.id],
      }),
    });

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.marked_count).toBe(2);
    expect(body.passengers).toHaveLength(2);
    expect(body.passengers.map((p: Record<string, unknown>) => p.passenger_id)).toEqual(
      expect.arrayContaining([PASSENGER_A.id, PASSENGER_B.id]),
    );

    // Verify ride_participation records created with driver_marked=true
    const records = await sql<{ passenger_id: string; driver_marked: boolean; marked_at: Date }[]>`
      SELECT passenger_id, driver_marked, marked_at FROM ride_participation
      WHERE ride_id = ${rideId}
      ORDER BY passenger_id
    `;
    expect(records).toHaveLength(2);
    for (const r of records) {
      expect(r.driver_marked).toBe(true);
      expect(r.marked_at).toBeInstanceOf(Date);
    }
  });
});

describe("POST /api/rides/:id/mark-participants — error cases", () => {
  it("not driver → 403 forbidden", async () => {
    const rideId = await seedRide(new Date(Date.now() - 3600000));
    const app = makeApp();
    const token = await makeToken(OTHER_USER); // not the driver

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${OTHER_USER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({
        passenger_ids: [PASSENGER_A.id],
      }),
    });

    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("forbidden");
  });

  it("before departure → 409 before_departure", async () => {
    const futureDate = new Date(Date.now() + 3600000); // 1 hour in future
    const rideId = await seedRide(futureDate);
    const app = makeApp();
    const token = await makeToken(DRIVER);

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({
        passenger_ids: [PASSENGER_A.id],
      }),
    });

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("before_departure");
  });

  it("no auth → 401", async () => {
    const rideId = await seedRide(new Date(Date.now() - 3600000));
    const app = makeApp();

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        passenger_ids: [PASSENGER_A.id],
      }),
    });

    expect(res.status).toBe(401);
  });

  it("invalid body (non-UUID in array) → 422", async () => {
    const rideId = await seedRide(new Date(Date.now() - 3600000));
    const app = makeApp();
    const token = await makeToken(DRIVER);

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({
        passenger_ids: ["not-a-uuid"],
      }),
    });

    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("validation failed");
  });

  it("empty array → 422", async () => {
    const rideId = await seedRide(new Date(Date.now() - 3600000));
    const app = makeApp();
    const token = await makeToken(DRIVER);

    const res = await app.request(`/api/rides/${rideId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({
        passenger_ids: [],
      }),
    });

    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("validation failed");
  });

  it("non-existent ride → 404 not_found", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const nonExistentId = "00000000-0000-0000-0000-000000000000";

    const res = await app.request(`/api/rides/${nonExistentId}/mark-participants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ passenger_ids: [PASSENGER_A.id] }),
    });

    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("invalid ride id format → 400 invalid ride id", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);

    const res = await app.request("/api/rides/not-a-valid-uuid/mark-participants", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ passenger_ids: [PASSENGER_A.id] }),
    });

    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid ride id");
  });
});
