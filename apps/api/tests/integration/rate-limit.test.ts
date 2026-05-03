/**
 * Integration: rate-limit middleware against real Postgres.
 * Uses low limits (userLimit=2, ipLimit=5) for fast testing.
 * Requires: Postgres + migrations 000-005 applied.
 */
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool";
import type { AppUser } from "../../src/middleware/identity-guard";
import { rateLimit } from "../../src/middleware/rate-limit";

const required = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
];

function buildDsn(): string {
  for (const v of required) {
    if (!process.env[v]) throw new Error(`Missing env: ${v}`);
  }
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

const USER_A: AppUser = { id: "00000000-0000-4000-a000-rl0000000001", tgId: 7001, role: "user" };
const USER_B: AppUser = { id: "00000000-0000-4000-a000-rl0000000002", tgId: 7002, role: "user" };
const TEST_IP = "10.0.0.1";

let sql: ReturnType<typeof createPool>;

function makeApp(user?: AppUser) {
  const app = new Hono();
  // Simulate request from trusted reverse proxy (docker bridge) so XFF is honored.
  app.use("/api/*", async (c, next) => {
    c.set("socketIp" as never, "172.20.0.2");
    if (user) c.set("user" as never, user);
    await next();
  });
  app.use("/api/*", rateLimit(sql, { userLimit: 2, ipLimit: 5 }));
  app.get("/api/ping", (c) => c.json({ ok: true }));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
});

afterEach(async () => {
  // Clean rate_limit_buckets between tests
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'user:%' OR key LIKE 'ip:${TEST_IP}%'`;
});

afterAll(async () => {
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'user:%' OR key LIKE 'ip:${TEST_IP}%'`;
  await sql.end();
});

describe("rateLimit integration: user counter", () => {
  it("first 2 requests pass, 3rd → 429", async () => {
    const app = makeApp(USER_A);
    const headers = { "X-Forwarded-For": TEST_IP };

    const r1 = await app.request("/api/ping", { headers });
    const r2 = await app.request("/api/ping", { headers });
    const r3 = await app.request("/api/ping", { headers });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers.get("Retry-After")).toBeTruthy();
  });

  it("different users have independent counters", async () => {
    const appA = makeApp(USER_A);
    const appB = makeApp(USER_B);
    const headers = { "X-Forwarded-For": TEST_IP };

    // User A uses both their slots
    await appA.request("/api/ping", { headers });
    await appA.request("/api/ping", { headers });

    // User B still has fresh counter
    const resB = await appB.request("/api/ping", { headers });
    expect(resB.status).toBe(200);
  });

  it("window resets: request with past window_start not counted", async () => {
    const app = makeApp(USER_A);
    const headers = { "X-Forwarded-For": TEST_IP };

    // Pre-fill the current window at the limit
    const userKey = `user:${USER_A.id}`;
    await sql`
      INSERT INTO rate_limit_buckets (key, window_start, count)
      VALUES (${userKey}, date_trunc('minute', NOW()), 2)
      ON CONFLICT (key, window_start) DO UPDATE SET count = 2
    `;

    // This request hits the limit
    const blocked = await app.request("/api/ping", { headers });
    expect(blocked.status).toBe(429);

    // Simulate next minute by deleting current window
    await sql`DELETE FROM rate_limit_buckets WHERE key = ${userKey}`;

    // Next request should pass (fresh window)
    const fresh = await app.request("/api/ping", { headers });
    expect(fresh.status).toBe(200);
  });
});
