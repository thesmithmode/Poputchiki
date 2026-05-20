/**
 * Integration: POST /auth/refresh — expired token edge case.
 * Remaining cases (revoked, deleted user, wrong type) live in auth-telegram.test.ts.
 */
import { createHmac } from "node:crypto";
import { sign } from "hono/jwt";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const TG_ID = 7_777_777_701;
const BOT_TOKEN = process.env.BOT_TOKEN ?? "fake_token_for_test";
const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-refresh-integration";

function makeInitData(tgId: number, nowSeconds: number, botToken: string): string {
  const user = JSON.stringify({ id: tgId, first_name: "RefreshTest", username: "refresh_test" });
  const fields: Record<string, string> = { auth_date: String(nowSeconds), user };
  const sorted = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = new Uint8Array(createHmac("sha256", "WebAppData").update(botToken).digest());
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return `${Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}&hash=${hash}`;
}

let sql: ReturnType<typeof postgres>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });
  app = createApp(sql, JWT_SECRET);
  await sql`DELETE FROM users WHERE tg_id = ${TG_ID}`.catch(() => null);
});

beforeEach(async () => {
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE tg_id = ${TG_ID}`.catch(() => null);
  await sql.end();
});

describe("POST /auth/refresh — expired token", () => {
  it("expired refresh token → 401", async () => {
    // login to get a valid user id
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID, now, BOT_TOKEN);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await readJson(loginRes);
    const userId = loginBody.user.id;

    // forge an expired refresh token
    const expiredToken = await sign(
      {
        sub: String(TG_ID),
        uid: userId,
        role: "user",
        typ: "refresh",
        jti: "expired-jti-unique-1",
        iat: now - 3700,
        exp: now - 3600, // expired 1 hour ago
      },
      JWT_SECRET,
    );

    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: expiredToken }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh — token rotation", () => {
  it("используя новый refresh token после ротации → 200", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 1, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);

    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const firstRefresh = loginBody.refresh_token;

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    // first rotation
    const r1 = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: firstRefresh }),
    });
    expect(r1.status).toBe(200);
    const r1Body = await readJson(r1);
    const secondRefresh = r1Body.refresh_token;

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    // second rotation with new token
    const r2 = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: secondRefresh }),
    });
    expect(r2.status).toBe(200);
    const r2Body = await readJson(r2);
    expect(typeof r2Body.access_token).toBe("string");

    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
  });
});

describe("POST /auth/refresh — H7 tg_id mismatch", () => {
  it("payload.sub не совпадает с users.tg_id → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 2, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 2}`.catch(() => null);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 99}`.catch(() => null);

    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(loginRes.status).toBe(200);
    const loginBody = await readJson(loginRes);
    const userId = loginBody.user.id;

    // Подделанный refresh: uid настоящий, но sub (tg_id) другой
    const forgedToken = await sign(
      {
        sub: String(TG_ID + 99),
        uid: userId,
        role: "user",
        typ: "refresh",
        jti: "forged-jti-h7-tgid-mismatch",
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: forgedToken }),
    });
    expect(res.status).toBe(401);

    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 2}`.catch(() => null);
  });

  it("payload.sub нечисловой → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const forgedToken = await sign(
      {
        sub: "not-a-number",
        uid: "00000000-0000-0000-0000-000000000000",
        role: "user",
        typ: "refresh",
        jti: "forged-jti-h7-sub-nan",
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: forgedToken }),
    });
    expect(res.status).toBe(401);
  });
});
