/**
 * Integration: POST /auth/logout — verify refresh token revoked → subsequent refresh fails.
 * Base logout cases (400/401/200) live in auth-telegram.test.ts.
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../../src/app";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const TG_ID = 7_777_777_800;
const BOT_TOKEN = process.env.BOT_TOKEN ?? "fake_token_for_test";
const JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-logout-integration";

function makeInitData(tgId: number, nowSeconds: number, botToken: string): string {
  const user = JSON.stringify({ id: tgId, first_name: "LogoutTest", username: "logout_test" });
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
  await sql`DELETE FROM users WHERE tg_id BETWEEN ${TG_ID} AND ${TG_ID + 10}`.catch(() => null);
});

beforeEach(async () => {
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE tg_id BETWEEN ${TG_ID} AND ${TG_ID + 10}`.catch(() => null);
  await sql.end();
});

describe("POST /auth/logout — revoke effect", () => {
  it("после logout refresh token инвалидируется → refresh вернёт 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID, now, BOT_TOKEN);
    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    expect(loginRes.status).toBe(200);
    const { refresh_token } = await readJson(loginRes);

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    const logoutRes = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    expect(logoutRes.status).toBe(200);

    // cookies cleared
    const cookie = logoutRes.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("tg_uid=;");

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    // revoked token cannot refresh
    const refreshRes = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    expect(refreshRes.status).toBe(401);
  });

  it("двойной logout с тем же токеном → второй вернёт 401 (токен уже отозван)", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 1, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);

    const loginRes = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const { refresh_token } = await readJson(loginRes);

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    const r1 = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    expect(r1.status).toBe(200);

    await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'auth:%'`.catch(() => null);

    const r2 = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    expect(r2.status).toBe(401);

    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
  });
});
