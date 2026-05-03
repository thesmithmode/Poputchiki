import { sign } from "hono/jwt";
import { describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";

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

function makeSql(revokedRows: unknown[] = [], userRows: unknown[] = [{ id: "u" }]) {
  // 3-call sequence: revoked check, user existence check, INSERT into revoked_tokens
  // biome-ignore lint/suspicious/noExplicitAny: mock
  return vi
    .fn()
    .mockResolvedValueOnce(revokedRows)
    .mockResolvedValueOnce(userRows)
    .mockResolvedValueOnce([]) as any;
}

describe("POST /auth/refresh", () => {
  it("valid refresh_token → 200 with new access_token and refresh_token", async () => {
    const router = createAuthRouter(makeSql([]));
    const refreshToken = await makeRefreshToken();

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
    expect(body.access_token).not.toBe(refreshToken);
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

  it("revoked refresh_token → 401", async () => {
    const jti = "revoked-jti-001";
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn().mockResolvedValueOnce([{ jti }]) as any;
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken(jti);

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
  });

  it("REGRESSION: refresh_token of soft-deleted user → 401 (no new tokens)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi
      .fn()
      .mockResolvedValueOnce([]) // revocation check: clean
      .mockResolvedValueOnce([]) as any; // user lookup: empty (deleted_at IS NOT NULL)
    const router = createAuthRouter(sql);
    const token = await makeRefreshToken("ok-jti");

    const res = await router.request("/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: token }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
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
