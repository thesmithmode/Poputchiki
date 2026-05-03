/**
 * Security sentinel: replay attack protection for /auth/telegram.
 * Tests: tampered hash, expired auth_date, future auth_date, replay via nonce,
 * and false-positive check (different nonces both pass).
 *
 * Requires: Postgres running + all migrations applied.
 * BOT_TOKEN and JWT_SECRET must be set in env (uses test values injected below).
 */
import { createHmac } from "node:crypto";
import { Hono } from "hono";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthRouter } from "../../src/auth/authRouter";
import { buildDsn } from "../integration/setup";

const TEST_BOT_TOKEN = "1234567890:test_bot_token_for_replay_sentinel";
const TEST_JWT_SECRET = "test-jwt-secret-replay-sentinel";
const TEST_USER = { id: 55500001, first_name: "Replay", last_name: "Test", username: "replaytest" };

let sql: ReturnType<typeof postgres>;

function makeApp(): Hono {
  const app = new Hono();
  app.route("/auth", createAuthRouter(sql));
  return app;
}

function buildInitData(overrides: {
  user?: object;
  auth_date?: number;
  hash?: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const user = overrides.user ?? TEST_USER;
  const authDate = overrides.auth_date ?? now;

  const params = new URLSearchParams();
  params.set("auth_date", String(authDate));
  params.set("user", JSON.stringify(user));

  // Compute correct hash
  const entries = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(TEST_BOT_TOKEN).digest();
  const correctHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  params.set("hash", overrides.hash ?? correctHash);
  return params.toString();
}

beforeAll(async () => {
  process.env.BOT_TOKEN = TEST_BOT_TOKEN;
  process.env.JWT_SECRET = TEST_JWT_SECRET;
  sql = postgres(buildDsn(), { max: 3 });
  // Clean nonces from previous runs
  const initData = buildInitData({});
  const hash = new URLSearchParams(initData).get("hash")!;
  await sql`DELETE FROM nonces WHERE hash = ${hash}`;
});

afterAll(async () => {
  process.env.BOT_TOKEN = undefined;
  process.env.JWT_SECRET = undefined;
  await sql.end();
});

describe("Replay attack protection — /auth/telegram", () => {
  it("tampered hash → 401", async () => {
    const app = makeApp();
    const initData = buildInitData({ hash: "a".repeat(64) });
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });

  it("auth_date in past >5min → 401", async () => {
    const app = makeApp();
    const staleDate = Math.floor(Date.now() / 1000) - 6 * 60;
    const initData = buildInitData({ auth_date: staleDate });
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });

  it("auth_date in future >5min → 401", async () => {
    const app = makeApp();
    const futureDate = Math.floor(Date.now() / 1000) + 6 * 60;
    const initData = buildInitData({ auth_date: futureDate });
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });

  it("valid initData first time → 200 (first use)", async () => {
    const app = makeApp();
    const initData = buildInitData({});
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(200);
  });

  it("same initData second time → 401 (replay blocked)", async () => {
    const app = makeApp();
    // Rebuild same initData with same timestamp — hash will differ due to different second
    // Use a fixed timestamp to get a deterministic hash for the replay test
    const fixedDate = Math.floor(Date.now() / 1000) - 30; // 30s ago, still fresh
    const initData = buildInitData({ auth_date: fixedDate });

    // First request should succeed (or nonce already used — either way test replay)
    await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });

    // Second request with exact same initData → replay → 401
    const res2 = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res2.status).toBe(401);
  });

  it("different nonce (different auth_date+1s) → 200 (not false-positive)", async () => {
    const app = makeApp();
    const date1 = Math.floor(Date.now() / 1000) - 60;
    const date2 = date1 - 1; // Different second = different hash
    const initData1 = buildInitData({ auth_date: date1 });
    const initData2 = buildInitData({ auth_date: date2 });

    // Both should be independent — clean first
    const hash1 = new URLSearchParams(initData1).get("hash")!;
    const hash2 = new URLSearchParams(initData2).get("hash")!;
    await sql`DELETE FROM nonces WHERE hash IN (${hash1}, ${hash2})`;

    const res1 = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData1 }),
    });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData2 }),
    });
    expect(res2.status).toBe(200);
  });
});
