import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCache } from "../../../src/geocode/geoCache";
import { createGeocodeRouter } from "../../../src/geocode/geocodeRouter";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";

const JWT_SECRET = "test-geocode-secret-32-chars!!!!!";
const USER = { id: "00000000-0000-4000-b000-000000000001", tgId: 123001, role: "user" as const };

async function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(USER.tgId),
      uid: USER.id,
      role: USER.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function authH(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` };
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
      headers: authH(token),
    });
    expect(res.status).toBe(400);
  });

  it("200 — проксирует ответ Nominatim", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(NOMINATIM_RESULT), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search?q=Царёво", {
      headers: authH(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(NOMINATIM_RESULT);
  });

  it("кэширует повторный запрос — Nominatim вызывается один раз", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(NOMINATIM_RESULT), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const cache = new GeoCache();
    const app = makeApp(mockFetch as unknown as typeof fetch, cache);
    const headers = authH(token);
    await app.request("/api/geocode/search?q=Царёво", { headers });
    await app.request("/api/geocode/search?q=Царёво", { headers });
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("SENTINEL: 503 при ошибке Nominatim — не подменяет результаты пользовательского запроса", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search?q=Москва", {
      headers: authH(token),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    const body = await readJson(res);
    expect(body.error).toBe("geocoder_unavailable");
    expect(body.results).toEqual([]);
  });

  it("429 при превышении 1 req/sec на user", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const headers = authH(token);
    // First request passes
    const res1 = await app.request("/api/geocode/search?q=test", { headers });
    expect(res1.status).toBe(200);
    // Immediate second request — same second → 429
    const res2 = await app.request("/api/geocode/search?q=other", { headers });
    expect(res2.status).toBe(429);
  });

  it("/reverse — 400 без lat/lon", async () => {
    const mockFetch = vi.fn();
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/reverse", { headers: authH(token) });
    expect(res.status).toBe(400);
  });

  it("/reverse — 400 если точка вне bbox", async () => {
    const mockFetch = vi.fn();
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/reverse?lat=55.75&lon=37.62", {
      headers: authH(token),
    });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("/reverse — 200 возвращает display_name", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          display_name: "ул. Тукая, Новое Шигалеево",
          lat: "55.81",
          lon: "49.43",
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/reverse?lat=55.81&lon=49.43", {
      headers: authH(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson<{ display_name: string }>(res);
    expect(body.display_name).toMatch(/Тукая/);
  });

  it("SENTINEL: результаты вне bbox Казани фильтруются на бэке", async () => {
    // bounded=1 advisory — Nominatim может вернуть Москву/Питер при пустом local resultset.
    // Хард-фильтр на бэке должен убрать всё за пределами 55.3-56.2°N / 48.5-50.0°E.
    const outOfArea = [
      { place_id: 10, display_name: "Москва, ул. Тукая", lat: "55.75", lon: "37.62" },
      { place_id: 11, display_name: "Санкт-Петербург", lat: "59.95", lon: "30.32" },
    ];
    const inArea = [
      { place_id: 12, display_name: "ул. Тукая, Казань", lat: "55.81", lon: "49.43" },
    ];
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([...outOfArea, ...inArea]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    const res = await app.request("/api/geocode/search?q=Тукая", {
      headers: authH(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson<{ place_id: number }[]>(res);
    expect(body.map((r) => r.place_id)).toEqual([12]);
  });

  it("structured search для 'Тукая 31' — village=Новое Шигалеево, street=Тукая 31", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    await app.request(`/api/geocode/search?q=${encodeURIComponent("Тукая 31")}`, {
      headers: authH(token),
    });
    const calledUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
    expect(calledUrl.searchParams.get("street")).toBe("Тукая 31");
    expect(calledUrl.searchParams.get("village")).toBe("Новое Шигалеево");
    expect(calledUrl.searchParams.get("state")).toBe("Татарстан");
    expect(calledUrl.searchParams.get("q")).toBeNull();
  });

  it("structured search для 'ул. Тукая, д.13' — извлекает дом 13", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    await app.request(`/api/geocode/search?q=${encodeURIComponent("ул. Тукая, д.13")}`, {
      headers: authH(token),
    });
    const calledUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
    expect(calledUrl.searchParams.get("street")).toBe("Тукая 13");
  });

  it("обычный запрос 'Казань Баумана' идёт как q-param без structured", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
      );
    const app = makeApp(mockFetch as unknown as typeof fetch);
    await app.request(`/api/geocode/search?q=${encodeURIComponent("Казань Баумана")}`, {
      headers: authH(token),
    });
    const calledUrl = new URL(String(mockFetch.mock.calls[0]?.[0]));
    expect(calledUrl.searchParams.get("q")).toBe("Казань Баумана");
    expect(calledUrl.searchParams.get("street")).toBeNull();
  });

  it("SENTINEL: дефолт NOMINATIM_URL — публичный nominatim.openstreetmap.org", async () => {
    // Self-hosted Nominatim профиль в compose выключен. Если кто-то вернёт дефолт
    // на 'http://nominatim:8080' — этот тест упадёт и поймает регрессию prod-инфры.
    // _nominatimUrl не передаём → читается из process.env → fallback на NOMINATIM_DEFAULT.
    const prev = process.env.NOMINATIM_URL;
    // biome-ignore lint/performance/noDelete: нужно реально удалить env var, чтобы сработал ?? default
    delete process.env.NOMINATIM_URL;
    try {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify([]), { headers: { "Content-Type": "application/json" } }),
        );
      const app = makeApp(mockFetch as unknown as typeof fetch, undefined, new Map());
      await app.request("/api/geocode/search?q=Казань", { headers: authH(token) });
      const calledUrl = String(mockFetch.mock.calls[0]?.[0]);
      expect(calledUrl).toMatch(/^https:\/\/nominatim\.openstreetmap\.org/);
    } finally {
      if (prev !== undefined) process.env.NOMINATIM_URL = prev;
    }
  });
});
