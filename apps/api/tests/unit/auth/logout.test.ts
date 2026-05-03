/**
 * Unit tests: POST /auth/logout — инвалидация refresh-токена + очистка cookies.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";

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

function makeSql() {
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return vi.fn().mockResolvedValue([]) as any;
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

  it("с валидным refresh → 200", async () => {
    const token = await makeRefreshToken("jti-logout-ok");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });
    expect(res.status).toBe(200);
  });

  it("с валидным refresh → Set-Cookie содержит Max-Age=0 (cookies cleared)", async () => {
    const token = await makeRefreshToken("jti-logout-cookies");
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    const setCookieHeaders = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("Set-Cookie") ?? ""];

    const joined = setCookieHeaders.join("|");
    expect(joined).toContain("Max-Age=0");
  });

  it("REGRESSION: с access_token в body → access jti тоже попадает в revoked_tokens", async () => {
    const refreshJti = "jti-refresh-x";
    const accessJti = "jti-access-x";
    const userId = "user-id-001";
    const refreshToken = await makeRefreshToken(refreshJti, userId);
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await sign(
      {
        sub: "123",
        uid: userId,
        role: "user",
        typ: "access",
        jti: accessJti,
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken }),
    });
    expect(res.status).toBe(200);

    const calls: unknown[][] = sql.mock.calls;
    const insertedJtis = calls.map((c) => c[1]).filter((v) => typeof v === "string");
    expect(insertedJtis).toContain(refreshJti);
    expect(insertedJtis).toContain(accessJti);
  });

  it("REGRESSION: access_token чужого user_id игнорируется (не ревокается)", async () => {
    const refreshToken = await makeRefreshToken("jti-r-1", "user-A");
    const now = Math.floor(Date.now() / 1000);
    const otherUserAccess = await sign(
      {
        sub: "x",
        uid: "user-B",
        role: "user",
        typ: "access",
        jti: "jti-other-access",
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken, access_token: otherUserAccess }),
    });

    const calls: unknown[][] = sql.mock.calls;
    const insertedJtis = calls.map((c) => c[1]).filter((v) => typeof v === "string");
    expect(insertedJtis).not.toContain("jti-other-access");
  });

  it("jti передаётся первым параметром в sql INSERT", async () => {
    const jti = "jti-to-revoke-001";
    const token = await makeRefreshToken(jti);

    await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    // sql вызывается как tagged template: sql`INSERT INTO revoked_tokens ... VALUES (${jti}, ...)`
    // values передаются как отдельные ��ргументы начиная с index 1
    const calls: unknown[][] = sql.mock.calls;
    const hasJtiInsert = calls.some((call) => call[1] === jti);
    expect(hasJtiInsert).toBe(true);
  });
});
