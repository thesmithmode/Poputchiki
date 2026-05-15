import { sign, verify } from "hono/jwt";
import { describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";
import { readJson } from "../../helpers/json";

const JWT_SECRET = "test-jwt-secret-at-least-32-chars!!";
vi.stubEnv("JWT_SECRET", JWT_SECRET);

async function makeRefreshToken(jti = "test-jti-refresh-001", ttlDelta = 30 * 24 * 3600) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: "99999",
      uid: "00000000-0000-4000-a000-000000000001",
      role: "user",
      typ: "refresh",
      jti,
      iat: now,
      exp: now + ttlDelta,
    },
    JWT_SECRET,
  );
}

// New /refresh flow does TWO SQL calls in sequence:
// 1. SELECT users WHERE id=... AND deleted_at IS NULL AND is_banned=false
// 2. INSERT INTO revoked_tokens ... ON CONFLICT DO NOTHING RETURNING jti
const DEFAULT_USER_ROW = { id: "u", tg_id: 99999, role: "user" };

function makeSql(
  userRows: unknown[] = [DEFAULT_USER_ROW],
  insertClaimRows: unknown[] = [{ jti: "ok" }],
) {
  return (
    vi
      .fn()
      .mockResolvedValueOnce(userRows)
      // biome-ignore lint/suspicious/noExplicitAny: mock
      .mockResolvedValueOnce(insertClaimRows) as any
  );
}

describe("POST /auth/refresh", () => {
  it("valid refresh_token → 200 with new access_token and refresh_token", async () => {
    const router = createAuthRouter(makeSql());
    const refreshToken = await makeRefreshToken();

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    expect(body.access_token).not.toBe(refreshToken);
  });

  it("SENTINEL: успешный refresh — переустанавливает tg_uid и csrf_token cookies", async () => {
    const router = createAuthRouter(makeSql());
    const refreshToken = await makeRefreshToken();

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const joined = setCookies.join("; ");
    expect(joined).toContain("tg_uid=99999");
    expect(joined).toContain("csrf_token=");
  });

  it("SENTINEL: role в новых токенах берётся из БД, не из payload", async () => {
    const userRow = { id: "u", tg_id: 99999, role: "admin" };
    const router = createAuthRouter(makeSql([userRow]));
    const refreshToken = await makeRefreshToken();

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await readJson(res);
    const decoded = await verify(body.access_token, JWT_SECRET, "HS256");
    expect(decoded.role).toBe("admin");
  });

  it("access_token instead of refresh_token → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const accessToken = await sign(
      {
        sub: "99999",
        uid: "uid-x",
        role: "user",
        typ: "access",
        jti: "acc-jti",
        iat: now,
        exp: now + 86400,
      },
      JWT_SECRET,
    );

    // biome-ignore lint/suspicious/noExplicitAny: mock
    const router = createAuthRouter(vi.fn() as any);
    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: accessToken }),
    });

    expect(res.status).toBe(401);
  });

  it("expired refresh_token → 401", async () => {
    const expiredToken = await makeRefreshToken("expired-jti", -1);

    // biome-ignore lint/suspicious/noExplicitAny: mock
    const router = createAuthRouter(vi.fn() as any);
    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: expiredToken }),
    });

    expect(res.status).toBe(401);
  });

  it("revoked refresh_token (INSERT returns empty) → 401", async () => {
    // user lookup ok, INSERT returns [] — jti already in revoked_tokens
    const sql = makeSql([DEFAULT_USER_ROW], []);
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken("revoked-jti-001");

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toMatch(/token revoked/);
  });

  it("SENTINEL: race — два одновременных refresh, второй проигрывает CAS → 401", async () => {
    // Имитация: user lookup ok, INSERT возвращает [] (proxy выиграл другой запрос)
    const sql = makeSql([DEFAULT_USER_ROW], []);
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken("race-jti");

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
  });

  it("REGRESSION: refresh_token of soft-deleted user → 401 (no new tokens)", async () => {
    // user lookup empty (deleted_at IS NOT NULL filtered out)
    const sql = makeSql([]);
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken("ok-jti");

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toMatch(/user not found/);
  });

  it("SENTINEL: refresh_token забаненного юзера → 401 (is_banned=true filtered out)", async () => {
    // user lookup empty — SQL фильтрует is_banned=false → банованный не вернётся
    const sql = makeSql([]);
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken("banned-jti");

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.error).toMatch(/user not found/);
  });

  it("missing refresh_token field → 400", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const router = createAuthRouter(vi.fn() as any);
    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("tampered token → 401", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const router = createAuthRouter(vi.fn() as any);
    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: "not.a.valid.jwt" }),
    });

    expect(res.status).toBe(401);
  });
});
