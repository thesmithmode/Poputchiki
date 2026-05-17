/**
 * Integration tests for POST /auth/telegram.
 * Requires Postgres running with all migrations applied.
 * Uses process.env.BOT_TOKEN — same token as the endpoint uses for verification.
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { readJson } from "../helpers/json";
import { buildDsn } from "./setup";

const TG_ID = 8_888_888_888;
const TG_USER = { id: TG_ID, first_name: "Integration", username: "int_test" };

function makeInitData(tgId: number, nowSeconds: number, botToken: string): string {
  const user = JSON.stringify({
    id: tgId,
    first_name: TG_USER.first_name,
    username: TG_USER.username,
  });
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
const BOT_TOKEN = process.env.BOT_TOKEN ?? "fake_token_for_test";

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });
  app = createApp(sql, process.env.JWT_SECRET);
  // Clean up any leftover state from previous runs
  await sql`DELETE FROM nonces WHERE hash LIKE '%'`.catch(() => null);
  await sql`DELETE FROM users WHERE tg_id = ${TG_ID}`.catch(() => null);
});

// Auth router has authRateLimit (10/min/IP). Сбрасываем перед каждым it,
// иначе fixture-логины забивают лимит и тесты получают 429 вместо целевого статуса.
beforeEach(async () => {
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE tg_id = ${TG_ID}`.catch(() => null);
  await sql`DELETE FROM nonces WHERE true`.catch(() => null);
  await sql.end();
});

describe("POST /auth/telegram — happy path", () => {
  let savedInitData: string;

  it("returns 200 with access_token and refresh_token", async () => {
    const now = Math.floor(Date.now() / 1000);
    savedInitData = makeInitData(TG_ID, now, BOT_TOKEN);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: savedInitData }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    expect(typeof body.user?.id).toBe("string");
    expect(body.user?.display_name).toBe("Integration");
    expect(body.user?.is_banned).toBe(false);
  });

  it("sets sess_bind and csrf_token cookies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 1, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    const hasBind = /sess_bind=[0-9a-f]{32}/.test(cookieHeader);
    const hasCsrf = cookieHeader.includes("csrf_token=");
    expect(hasBind).toBe(true);
    expect(hasCsrf).toBe(true);
    const sessBindPart =
      cookieHeader.split(/,(?=\s*\w+=)/).find((p) => p.includes("sess_bind=")) ?? "";
    const csrfPart =
      cookieHeader.split(/,(?=\s*\w+=)/).find((p) => p.includes("csrf_token=")) ?? "";
    expect(/HttpOnly/i.test(sessBindPart)).toBe(true);
    expect(/HttpOnly/i.test(csrfPart)).toBe(false);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
  });

  it("upserts user in DB", async () => {
    const rows = await sql`SELECT id, tg_id, display_name FROM users WHERE tg_id = ${TG_ID}`;
    expect(rows.length).toBe(1);
    expect(String(rows[0]?.tg_id)).toBe(String(TG_ID));
    expect(typeof rows[0]?.display_name).toBe("string");
  });

  it("replay of same initData → 401", async () => {
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: savedInitData }),
    });
    expect(res.status).toBe(401);
  });

  it("returning user updates last_seen_at", async () => {
    const [before] = await sql`SELECT last_seen_at FROM users WHERE tg_id = ${TG_ID}`;
    await new Promise((r) => setTimeout(r, 1100));
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID, now, BOT_TOKEN);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(200);
    const [after] = await sql`SELECT last_seen_at FROM users WHERE tg_id = ${TG_ID}`;
    expect(new Date(after?.last_seen_at).getTime()).toBeGreaterThan(
      new Date(before?.last_seen_at).getTime(),
    );
  });
});

describe("POST /auth/telegram — rejection cases", () => {
  it("tampered hash → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID, now, BOT_TOKEN);
    const tampered = initData.replace(/hash=[0-9a-f]{64}$/, `hash=${"0".repeat(64)}`);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: tampered }),
    });
    expect(res.status).toBe(401);
  });

  it("expired auth_date → 401", async () => {
    const stale = Math.floor(Date.now() / 1000) - 7200;
    const initData = makeInitData(TG_ID, stale, BOT_TOKEN);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(res.status).toBe(401);
  });

  it("missing initData body → 400", async () => {
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("non-JSON body → 400 (catch arrow falls back to {})", async () => {
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/refresh — refresh token endpoint", () => {
  let refreshToken: string;

  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 100, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 100}`.catch(() => null);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const body = await readJson(res);
    refreshToken = body.refresh_token;
  });

  afterAll(async () => {
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 100}`.catch(() => null);
  });

  it("returns new tokens on valid refresh token", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
  });

  it("missing refresh_token → 400", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("invalid token format → 401", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "invalid_token_string" }),
    });
    expect(res.status).toBe(401);
  });

  it("non-JSON body → 400 (catch arrow falls back to {})", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-a-json",
    });
    expect(res.status).toBe(400);
  });

  it("access token instead of refresh → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 101, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 101}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: loginBody.access_token }),
    });
    expect(res.status).toBe(401);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 101}`.catch(() => null);
  });

  it("revoked token → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 102, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 102}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const refreshTok = loginBody.refresh_token;
    await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTok }),
    });
    const res2 = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTok }),
    });
    expect(res2.status).toBe(401);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 102}`.catch(() => null);
  });

  it("deleted user → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 103, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 103}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const refreshTok = loginBody.refresh_token;
    const uid = loginBody.user.id;
    await sql`UPDATE users SET deleted_at = NOW() WHERE id = ${uid}`;
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTok }),
    });
    expect(res.status).toBe(401);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 103}`.catch(() => null);
  });
});

describe("POST /auth/logout — logout endpoint", () => {
  it("revokes both tokens and clears cookies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 200, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 200}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const logoutRes = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: loginBody.refresh_token,
        access_token: loginBody.access_token,
      }),
    });
    expect(logoutRes.status).toBe(200);
    const body = await readJson(logoutRes);
    expect(body.ok).toBe(true);
    const cookieHeader = logoutRes.headers.get("set-cookie") ?? "";
    expect(cookieHeader).toContain("sess_bind=");
    expect(cookieHeader).toContain("csrf_token=");
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 200}`.catch(() => null);
  });

  it("missing refresh_token → 400", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("invalid refresh token → 401", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "bad_token" }),
    });
    expect(res.status).toBe(401);
  });

  it("non-JSON body → 400 (catch arrow falls back to {})", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-a-json",
    });
    expect(res.status).toBe(400);
  });

  it("access token type → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 201, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 201}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: loginBody.access_token }),
    });
    expect(res.status).toBe(401);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 201}`.catch(() => null);
  });

  it("logout without access_token (only refresh)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 202, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 202}`.catch(() => null);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const loginBody = await readJson(loginRes);
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: loginBody.refresh_token }),
    });
    expect(res.status).toBe(200);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 202}`.catch(() => null);
  });
});
