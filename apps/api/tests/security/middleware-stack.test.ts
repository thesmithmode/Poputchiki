import { sign } from "hono/jwt";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";

const JWT_SECRET = "test-sentinel-middleware-stack";
const ALLOWED_ORIGIN = "https://test.example.com";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn().mockResolvedValue([]) as any;

const app = createApp(mockSql, JWT_SECRET);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Public endpoints that intentionally accept unauthenticated requests
const PUBLIC_PATHS = new Set(["/api/client-errors"]);

function getApiMutatingRoutes(): { method: string; path: string }[] {
  return app.routes
    .filter(
      (r) =>
        MUTATING_METHODS.has(r.method) &&
        r.path.startsWith("/api/") &&
        !r.path.includes("*") &&
        !PUBLIC_PATHS.has(r.path),
    )
    .map((r) => ({ method: r.method, path: r.path }));
}

describe("Middleware-stack completeness", () => {
  it("приложение создаётся и имеет маршруты", () => {
    expect(app.routes.length).toBeGreaterThan(0);
  });

  it("/api/* mutating routes exist", () => {
    const routes = getApiMutatingRoutes();
    expect(routes.length).toBeGreaterThan(0);
  });
});

describe("identity-guard: все /api/* mutating routes требуют JWT", () => {
  const routes = app.routes.filter(
    (r) =>
      MUTATING_METHODS.has(r.method) &&
      r.path.startsWith("/api/") &&
      !r.path.includes("*") &&
      !PUBLIC_PATHS.has(r.path),
  );

  for (const route of routes) {
    it(`${route.method} ${route.path} без токена → 401`, async () => {
      const res = await app.request(
        route.path.replace(/:[\w]+/g, "00000000-0000-4000-a000-000000000001"),
        {
          method: route.method,
          headers: {
            "Content-Type": "application/json",
            Origin: ALLOWED_ORIGIN,
            "X-CSRF-Token": "test",
          },
          body: route.method !== "GET" ? JSON.stringify({}) : undefined,
        },
      );
      expect(res.status).toBe(401);
    });
  }
});

describe("security: /api/* mutating routes блокируют запросы без sess_bind cookie", () => {
  // identityGuard требует оба: Authorization: Bearer + sess_bind cookie.
  // sess_bind = HMAC(jwtSecret, jti) — не выводится из JWT без знания секрета.
  it("POST /api/rides с валидным JWT но без sess_bind cookie → 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sign(
      {
        sub: "123",
        uid: "00000000-0000-4000-a000-000000000001",
        role: "user",
        jti: "csrf-test-jti",
        iat: now,
        exp: now + 3600,
      },
      JWT_SECRET,
    );

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // НЕТ sess_bind cookie → identityGuard вернёт 401
        Origin: ALLOWED_ORIGIN,
      },
      body: JSON.stringify({
        from_label: "A",
        from_lat: 55.0,
        from_lng: 37.0,
        to_label: "B",
        to_lat: 55.1,
        to_lng: 37.1,
        departure_at: new Date(Date.now() + 86400000).toISOString(),
        seats_total: 2,
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe("/auth/* routes: НЕ требуют identity-guard", () => {
  it("POST /auth/telegram без JWT → не 401 (можно 400/422 если нет initData)", async () => {
    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(401);
    // 400 ожидается (нет initData)
    expect(res.status).toBe(400);
  });

  it("POST /auth/refresh без JWT → не 401 (можно 400 если нет refresh_token)", async () => {
    const res = await app.request("/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });

  it("POST /auth/logout без JWT → не 401 (можно 400 если нет токена)", async () => {
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });
});
