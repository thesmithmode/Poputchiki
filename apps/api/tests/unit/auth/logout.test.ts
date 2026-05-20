/**
 * Unit tests: POST /auth/logout — инвалидация refresh-токена + очистка cookies.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";
import { signSessionBinding } from "../../../src/lib/cookie";

const JWT_SECRET = "test-secret-logout";

async function makeRefreshToken(jti: string, userId = "user-id-001"): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: "123",
      uid: userId,
      role: "user",
      typ: "refresh",
      jti,
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

async function makeAccessToken(
  jti: string,
  userId = "user-id-001",
): Promise<{ token: string; cookie: string }> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    {
      sub: "123",
      uid: userId,
      role: "user",
      typ: "access",
      jti,
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
  return { token, cookie: `sess_bind=${signSessionBinding(JWT_SECRET, jti)}` };
}

function makeSql() {
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql + begin transaction
  const sql: any = vi.fn().mockResolvedValue([]);
  // sql.begin(fn) → fn(tx) where tx is the same tagged-template mock
  sql.begin = vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(sql));
  return sql;
}

describe("POST /auth/logout", () => {
  let app: Hono;
  // biome-ignore lint/suspicious/noExplicitAny: mock sql
  let sql: any;

  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    sql = makeSql();
    app = new Hono();
    app.route("/auth", createAuthRouter(sql));
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: test cleanup of env var requires delete
    delete process.env.JWT_SECRET;
    vi.restoreAllMocks();
  });

  it("без refresh_token в body → 400", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("с невалидным (плохо подписанным) токеном → 401", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "not-a-jwt.at.all" }),
    });
    expect(res.status).toBe(401);
  });

  it("с access-токеном вместо refresh → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await sign(
      {
        sub: "123",
        uid: "user-id-001",
        role: "user",
        typ: "access",
        jti: "jti-access",
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: accessToken }),
    });
    expect(res.status).toBe(401);
  });

  it("с валидным refresh + access + sess_bind → 200", async () => {
    const refresh = await makeRefreshToken("jti-logout-ok");
    const { token: access, cookie } = await makeAccessToken("jti-access-ok");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });
    expect(res.status).toBe(200);
  });

  it("валидный logout → Set-Cookie содержит Max-Age=0 (cookies cleared)", async () => {
    const refresh = await makeRefreshToken("jti-logout-cookies");
    const { token: access, cookie } = await makeAccessToken("jti-access-cookies");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });

    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("Set-Cookie") ?? ""];

    const joined = setCookieHeaders.join("|");
    expect(joined).toContain("Max-Age=0");
  });

  it("H6: refresh без access_token → 400 (session-binding guard)", async () => {
    const token = await makeRefreshToken("jti-logout-no-access");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });
    expect(res.status).toBe(400);
  });

  it("H6: refresh + access без sess_bind cookie → 401 (anti-DoS)", async () => {
    const refresh = await makeRefreshToken("jti-r-no-cookie");
    const { token: access } = await makeAccessToken("jti-a-no-cookie");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });
    expect(res.status).toBe(401);
  });

  it("H6: refresh + access + неверный sess_bind cookie → 401", async () => {
    const refresh = await makeRefreshToken("jti-r-bad-cookie");
    const { token: access } = await makeAccessToken("jti-a-bad-cookie");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "sess_bind=forgery_attempt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });
    expect(res.status).toBe(401);
  });

  it("REGRESSION: с access_token + sess_bind → access jti тоже попадает в revoked_tokens", async () => {
    const refreshJti = "jti-refresh-x";
    const accessJti = "jti-access-x";
    const userId = "user-id-001";
    const refreshToken = await makeRefreshToken(refreshJti, userId);
    const { token: accessToken, cookie } = await makeAccessToken(accessJti, userId);

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken }),
    });
    expect(res.status).toBe(200);

    const calls: unknown[][] = sql.mock.calls;
    const insertedJtis = calls.map((c) => c[1]).filter((v) => typeof v === "string");
    expect(insertedJtis).toContain(refreshJti);
    expect(insertedJtis).toContain(accessJti);
  });

  it("REGRESSION: access_token чужого user_id → 400 (uid mismatch ⇒ no accessJti ⇒ H6 guard)", async () => {
    const refreshToken = await makeRefreshToken("jti-r-1", "user-A");
    const { token: otherUserAccess, cookie } = await makeAccessToken("jti-other-access", "user-B");

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refreshToken, access_token: otherUserAccess }),
    });
    // uid mismatch → accessJti=null → H6 guard блокирует (missing access_token)
    expect(res.status).toBe(400);

    const calls: unknown[][] = sql.mock.calls;
    const insertedJtis = calls.map((c) => c[1]).filter((v) => typeof v === "string");
    expect(insertedJtis).not.toContain("jti-other-access");
  });

  it("ATOM-01: при сбое sql.begin → 500 и cookies НЕ очищены (revocation атомарна)", async () => {
    // sql.begin переопределяем чтобы фейлился — симуляция DB blip между INSERT
    sql.begin = vi.fn(() => Promise.reject(new Error("connection lost")));
    const refresh = await makeRefreshToken("jti-atom-01");
    const { token: access, cookie } = await makeAccessToken("jti-atom-01-a");

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/revocation/i);
    // cookies очищаем ТОЛЬКО после успешной транзакции — иначе ложное чувство logout
    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("Set-Cookie") ?? ""];
    const joined = setCookieHeaders.join("|");
    expect(joined).not.toContain("Max-Age=0");
  });

  it("jti передаётся первым параметром в sql INSERT", async () => {
    const jti = "jti-to-revoke-001";
    const refresh = await makeRefreshToken(jti);
    const { token: access, cookie } = await makeAccessToken("jti-a-insert");

    await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ refresh_token: refresh, access_token: access }),
    });

    // sql вызывается как tagged template: sql`INSERT INTO revoked_tokens ... VALUES (${jti}, ...)`
    // values передаются как отдельные аргументы начиная с index 1
    const calls: unknown[][] = sql.mock.calls;
    const hasJtiInsert = calls.some((call) => call[1] === jti);
    expect(hasJtiInsert).toBe(true);
  });
});
