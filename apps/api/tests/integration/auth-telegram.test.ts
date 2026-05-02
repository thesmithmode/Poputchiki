/**
 * Integration tests for POST /auth/telegram.
 * Requires Postgres running with all migrations applied.
 * Uses process.env.BOT_TOKEN — same token as the endpoint uses for verification.
 */
import { createHmac } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app";

const TG_ID = 8_888_888_888;
const TG_USER = { id: TG_ID, first_name: "Integration", username: "int_test" };

function buildDsn(): string {
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

function makeInitData(tgId: number, nowSeconds: number, botToken: string): string {
  const user = JSON.stringify({
    id: tgId,
    first_name: TG_USER.first_name,
    username: TG_USER.username,
  });
  const fields: Record<string, string> = { auth_date: String(nowSeconds), user };
  const sorted = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
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
  app = createApp(sql);
  // Clean up any leftover state from previous runs
  await sql`DELETE FROM nonces WHERE hash LIKE '%'`.catch(() => null);
  await sql`DELETE FROM users WHERE tg_id = ${TG_ID}`.catch(() => null);
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
    const body = await res.json();
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    expect(body.user?.tg_id).toBe(TG_ID);
  });

  it("sets tg_uid and csrf_token cookies", async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = makeInitData(TG_ID + 1, now, BOT_TOKEN);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData }),
    });
    const cookieHeader = res.headers.get("set-cookie") ?? "";
    const hasUid = cookieHeader.includes(`tg_uid=${TG_ID + 1}`);
    const hasCsrf = cookieHeader.includes("csrf_token=");
    expect(hasUid).toBe(true);
    expect(hasCsrf).toBe(true);
    await sql`DELETE FROM users WHERE tg_id = ${TG_ID + 1}`.catch(() => null);
  });

  it("upserts user in DB", async () => {
    const rows = await sql`SELECT id, tg_id, display_name FROM users WHERE tg_id = ${TG_ID}`;
    expect(rows.length).toBe(1);
    expect(rows[0]?.tg_id).toBe(TG_ID);
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
    const stale = Math.floor(Date.now() / 1000) - 400;
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
});
