import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCache } from "../../../src/geocode/geoCache";
import { createGeocodeRouter } from "../../../src/geocode/geocodeRouter";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { readJson } from "../../helpers/json";

const JWT_SECRET = "test-geocode-secret";
const USER = { id: "00000000-0000-4000-b000-000000000001", tgId: 123001, role: "user" as const };

async function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(USER.tgId),
      uid: USER.id,
      role: USER.role,
      typ: "access",
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeApp(mockFetch: typeof fetch, cache?: GeoCache, lastRequestAt?: Map<string, number>) {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route(
    "/api/geocode",
    createGeocodeRouter({ _fetch: mockFetch, cache, _lastRequestAt: lastRequestAt ?? new Map() }),
  );
  return app;
}

const NOMINATIM_RESULT = [{ place_id: 1, display_name: "ЖК Царёво", lat: "55.75", lon: "49.25" }];

describe("GET /api/geocode/search", () => {
  let token: string;

  beforeEach(async () => {
    token = await makeToken();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("401 без авторизации", async () => {
    const app = makeApp(fetch);
    const res = await app.request("/api/geocode/search?q=test");
    expect(res.status).toBe(401);
  });

  it("400 без параметра q", async () => {
    const mockFetch = vi.fn();
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` },
    });
    expect(res.status).toBe(400);
  });

  it("200 — проксирует ответ Nominatim", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(NOMINATIM_RESULT), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search?q=Царёво", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(NOMINATIM_RESULT);
  });

  it("кэширует повторный запрос — Nominatim вызывается один раз", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(NOMINATIM_RESULT), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    const cache = new GeoCache();
    const app = makeApp(mockFetch as unknown as typeof fetch, cache);
    const headers = { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` };
    await app.request("/api/geocode/search?q=Царёво", { headers });
    await app.request("/api/geocode/search?q=Царёво", { headers });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("fallback статический список при ошибке Nominatim", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search?q=Царёво", {
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty("display_name");
    expect(body[0]).toHaveProperty("lat");
    expect(body[0]).toHaveProperty("lon");
  });

  it("429 при превышении 1 req/sec на user", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const headers = { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` };
    // First request passes
    const res1 = await app.request("/api/geocode/search?q=test", { headers });
    expect(res1.status).toBe(200);
    // Immediate second request — same second → 429
    const res2 = await app.request("/api/geocode/search?q=other", { headers });
    expect(res2.status).toBe(429);
  });
});
