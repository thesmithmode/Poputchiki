import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
/**
 * Integration tests: POST /api/rides against real Postgres.
 * Requires: Postgres + migrations 000-005 applied.
 * Uses test users pre-inserted via withSystem to avoid auth overhead.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-rides-integration";
const TEST_IP = "10.0.2.1";

const USER_ESTABLISHED = {
  id: "00000000-0000-4000-b000-100000000001",
  tgId: 8001,
  role: "user" as const,
};
const USER_NEW = {
  id: "00000000-0000-4000-b000-100000000002",
  tgId: 8002,
  role: "user" as const,
};
const USER_NO_LIKES = {
  id: "00000000-0000-4000-b000-100000000003",
  tgId: 8003,
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
  app.use("/api/*", rateLimit(sql, { userLimit: 100, ipLimit: 1000 }));
  app.use("/api/*", auditLog(sql));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

function futureDate(hoursFromNow = 2): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

const BASE_BODY = {
  from_label: "Царёво Village, ул. Тукая",
  from_lat: 55.811,
  from_lng: 49.44,
  to_label: "ТЦ МЕГА Казань",
  to_lat: 55.863,
  to_lng: 49.099,
  seats_total: 2,
};

beforeAll(async () => {
  sql = createPool(buildDsn());

  // Insert test users as DB owner (bypasses FORCE RLS)
  await withSystem(sql, async (tx) => {
    // Established account (created >24h ago, has likes)
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES (
        ${USER_ESTABLISHED.id}, ${USER_ESTABLISHED.tgId}, 'Established User', 5,
        NOW() - INTERVAL '2 days'
      )
      ON CONFLICT (tg_id) DO UPDATE SET
        likes_received_count = 5,
        created_at = NOW() - INTERVAL '2 days'
    `;
    // New account (<24h, no likes)
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES (
        ${USER_NEW.id}, ${USER_NEW.tgId}, 'New User', 0,
        NOW() - INTERVAL '1 hour'
      )
      ON CONFLICT (tg_id) DO UPDATE SET
        likes_received_count = 0,
        created_at = NOW() - INTERVAL '1 hour'
    `;
    // Old account but zero likes
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, created_at)
      VALUES (
        ${USER_NO_LIKES.id}, ${USER_NO_LIKES.tgId}, 'No Likes User', 0,
        NOW() - INTERVAL '2 days'
      )
      ON CONFLICT (tg_id) DO UPDATE SET
        likes_received_count = 0,
        created_at = NOW() - INTERVAL '2 days'
    `;
  });
});

afterEach(async () => {
  await sql`DELETE FROM audit_log WHERE user_id IN (${USER_ESTABLISHED.id}, ${USER_NEW.id}, ${USER_NO_LIKES.id})`;
  await sql`DELETE FROM rides WHERE driver_id IN (${USER_ESTABLISHED.id}, ${USER_NEW.id}, ${USER_NO_LIKES.id})`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE 'user:%rides%'`;
});

afterAll(async () => {
  await sql`DELETE FROM audit_log WHERE user_id IN (${USER_ESTABLISHED.id}, ${USER_NEW.id}, ${USER_NO_LIKES.id})`;
  await sql`DELETE FROM rides WHERE driver_id IN (${USER_ESTABLISHED.id}, ${USER_NEW.id}, ${USER_NO_LIKES.id})`;
  await sql`DELETE FROM users WHERE id IN (${USER_ESTABLISHED.id}, ${USER_NEW.id}, ${USER_NO_LIKES.id})`;
  await sql.end();
});

describe("POST /api/rides — happy path", () => {
  it("valid POST → 201 + ride in DB + audit_log", async () => {
    const app = makeApp();
    const token = await makeToken(USER_ESTABLISHED);
    const body = { ...BASE_BODY, departure_at: futureDate() };

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(201);
    const ride = await readJson(res);
    expect(ride.driver_id).toBe(USER_ESTABLISHED.id);
    expect(ride.seats_total).toBe(2);
    expect(ride.status).toBe("active");

    // Verify ride in DB
    const dbRides = await sql`SELECT * FROM rides WHERE id = ${ride.id as string}`;
    expect(dbRides[0]?.driver_id).toBe(USER_ESTABLISHED.id);

    // Verify audit_log entry written by middleware (single record, action = "METHOD path")
    const auditRows =
      await sql`SELECT * FROM audit_log WHERE entity = 'rides' AND user_id = ${USER_ESTABLISHED.id}`;
    expect(auditRows.length).toBe(1);
    expect(String(auditRows[0]?.action)).toMatch(/^POST \/api\/rides/);
    expect(auditRows[0]?.user_id).toBe(USER_ESTABLISHED.id);
  });
});

describe("POST /api/rides — validation errors", () => {
  it("past departure_at → 422", async () => {
    const app = makeApp();
    const token = await makeToken(USER_ESTABLISHED);
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ ...BASE_BODY, departure_at: "2020-01-01T00:00:00.000Z" }),
    });
    expect(res.status).toBe(422);
  });

  it("seats_total=0 → 422", async () => {
    const app = makeApp();
    const token = await makeToken(USER_ESTABLISHED);
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ ...BASE_BODY, departure_at: futureDate(), seats_total: 0 }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /api/rides — anti-bot", () => {
  it("new account 2nd active ride → 403", async () => {
    const app = makeApp();
    const token = await makeToken(USER_NEW);

    // First ride succeeds
    const r1 = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ ...BASE_BODY, departure_at: futureDate() }),
    });
    expect(r1.status).toBe(201);

    // Second ride blocked (new account already has 1 active)
    const r2 = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
        "X-Forwarded-For": TEST_IP,
      },
      body: JSON.stringify({ ...BASE_BODY, departure_at: futureDate(3) }),
    });
    expect(r2.status).toBe(403);
  });

  it("no-likes account 4th ride today → 403", async () => {
    const app = makeApp();
    const token = await makeToken(USER_NO_LIKES);
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      "X-Forwarded-For": TEST_IP,
    };

    // Pre-insert 3 rides for today
    await withSystem(sql, async (tx) => {
      for (let i = 0; i < 3; i++) {
        await tx`
          INSERT INTO rides
            (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
             departure_at, seats_total)
          VALUES
            (${USER_NO_LIKES.id}, 'From', 55.0, 37.0, 'To', 56.0, 38.0,
             NOW() + INTERVAL '2 hours', 2)
        `;
      }
    });

    const res = await app.request("/api/rides", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...BASE_BODY, departure_at: futureDate() }),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /api/rides — auth", () => {
  it("no auth → 401", async () => {
    const app = makeApp();
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE_BODY, departure_at: futureDate() }),
    });
    expect(res.status).toBe(401);
  });
});
