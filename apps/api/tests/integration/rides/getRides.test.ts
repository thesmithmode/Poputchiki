/**
 * Integration tests: GET /api/rides against real Postgres.
 * Requires: Postgres + migrations 000-005 applied.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-getrides-integration";
const TEST_IP = "10.0.3.1";

const DRIVER_A = {
  id: "00000000-0000-4000-c000-c00000000001",
  tgId: 9001,
  role: "user" as const,
};
const DRIVER_B = {
  id: "00000000-0000-4000-c000-c00000000002",
  tgId: 9002,
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
  app.use("/api/*", rateLimit(sql, { userLimit: 500, ipLimit: 5000 }));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

function futureAt(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60 * 1000).toISOString();
}

async function insertRide(
  driverId: string,
  minutesFromNow: number,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const rows = await sql`
    INSERT INTO rides
      (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
       departure_at, seats_total)
    VALUES
      (${driverId}, 'From', 55.75, 37.61, 'To', 55.8, 37.65,
       ${futureAt(minutesFromNow)}, ${2})
    RETURNING id
  `;
  const id = rows[0]?.id as string;
  if (overrides.price_rub !== undefined) {
    await sql`UPDATE rides SET price_rub = ${overrides.price_rub as number} WHERE id = ${id}`;
  }
  return id;
}

beforeAll(async () => {
  sql = createPool(buildDsn());

  // GET /api/rides returns ALL rides (no driver filter), so other integration
  // suites' ride seeds bleed into pagination counts. Wipe rides table fully —
  // fileParallelism=false guarantees no concurrent file is mid-run.
  await sql`TRUNCATE TABLE ride_requests, ride_participation, rides RESTART IDENTITY CASCADE`;

  await withSystem(sql, async (tx) => {
    // Driver A: established, has likes
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES (${DRIVER_A.id}, ${DRIVER_A.tgId}, 'Driver A', 5, NOW() - INTERVAL '10 days')
      ON CONFLICT (tg_id) DO UPDATE SET likes_received_count = 5, created_at = NOW() - INTERVAL '10 days'
    `;
    // Driver B: established, zero likes
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES (${DRIVER_B.id}, ${DRIVER_B.tgId}, 'Driver B', 0, NOW() - INTERVAL '10 days')
      ON CONFLICT (tg_id) DO UPDATE SET likes_received_count = 0, created_at = NOW() - INTERVAL '10 days'
    `;
  });

  // Insert 60 rides for DRIVER_A, 5 for DRIVER_B
  for (let i = 1; i <= 60; i++) {
    await insertRide(DRIVER_A.id, i * 10);
  }
  for (let i = 1; i <= 5; i++) {
    await insertRide(DRIVER_B.id, i * 10 + 5);
  }
});

afterAll(async () => {
  await sql`DELETE FROM rides WHERE driver_id IN (${DRIVER_A.id}, ${DRIVER_B.id})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER_A.id}, ${DRIVER_B.id})`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE ${`user:${DRIVER_A.id}%`} OR key LIKE ${`user:${DRIVER_B.id}%`}`;
  await sql.end();
});

describe("GET /api/rides — pagination", () => {
  it("first page → 50 rides + nextCursor", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER_A);
    const res = await app.request("/api/rides", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER_A.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(50);
    expect(typeof body.nextCursor).toBe("string");
  });

  it("second page via cursor → remaining rides + null nextCursor", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER_A);
    const headers = {
      Authorization: `Bearer ${token}`,
      Cookie: `tg_uid=${DRIVER_A.tgId}`,
      "X-Forwarded-For": TEST_IP,
    };

    const p1 = await readJson(await app.request("/api/rides", { headers }));
    expect(p1.rides).toHaveLength(50);

    const p2res = await app.request(`/api/rides?cursor=${p1.nextCursor}`, { headers });
    expect(p2res.status).toBe(200);
    const p2 = await readJson(p2res);
    // 60 (A) + 5 (B) = 65 total, page 1 = 50, page 2 = 15
    expect(p2.rides).toHaveLength(15);
    expect(p2.nextCursor).toBeNull();
  });

  it("pages are non-overlapping (ids distinct)", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER_A);
    const headers = {
      Authorization: `Bearer ${token}`,
      Cookie: `tg_uid=${DRIVER_A.tgId}`,
      "X-Forwarded-For": TEST_IP,
    };

    const p1 = await readJson(await app.request("/api/rides", { headers }));
    const p2 = await readJson(await app.request(`/api/rides?cursor=${p1.nextCursor}`, { headers }));

    const p1Ids = new Set(p1.rides.map((r: { id: string }) => r.id));
    const p2Ids = p2.rides.map((r: { id: string }) => r.id);
    for (const id of p2Ids) {
      expect(p1Ids.has(id)).toBe(false);
    }
  });
});

describe("GET /api/rides — filters", () => {
  it("trustMinLikes=3 → only Driver A rides (5 likes)", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER_A);
    const res = await app.request("/api/rides?trustMinLikes=3", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER_A.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    // All rides belong to DRIVER_A (0 from DRIVER_B who has 0 likes)
    for (const ride of body.rides) {
      expect(ride.driver_id).toBe(DRIVER_A.id);
    }
  });

  it("seatsMin=2 → only rides with available seats ≥ 2", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER_A);
    const res = await app.request("/api/rides?seatsMin=2", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `tg_uid=${DRIVER_A.tgId}`,
        "X-Forwarded-For": TEST_IP,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    for (const ride of body.rides) {
      expect(ride.seats_total - ride.seats_taken).toBeGreaterThanOrEqual(2);
    }
  });
});
