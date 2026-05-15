import { Hono } from "hono";
import type { AppUser } from "../middleware/identity-guard";
import { GeoCache } from "./geoCache";

const NOMINATIM_URL = process.env.NOMINATIM_URL ?? "http://nominatim:8080";

// Kazan region bounding box for Nominatim: left,top,right,bottom
const BBOX_KAZAN = "48.6,56.2,49.5,55.5";

interface GeocodeRouterOptions {
  cache?: GeoCache | undefined;
  _fetch?: typeof fetch | undefined;
  _lastRequestAt?: Map<string, number> | undefined;
}

export function createGeocodeRouter(options: GeocodeRouterOptions = {}): Hono {
  const cache = options.cache ?? new GeoCache();
  const fetchFn = options._fetch ?? fetch;
  const lastRequestAt = options._lastRequestAt ?? new Map<string, number>();

  const app = new Hono();

  app.get("/search", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const q = c.req.query("q");
    if (!q?.trim()) return c.json({ error: "q is required" }, 400);

    // 1 req/sec per user rate limit
    const now = Date.now();
    const lastAt = lastRequestAt.get(user.id) ?? 0;
    if (now - lastAt < 1000) {
      c.header("Retry-After", "1");
      return c.json({ error: "rate limit exceeded" }, 429);
    }
    lastRequestAt.set(user.id, now);

    const cacheKey = q.toLowerCase().trim();
    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
      return c.json(cached);
    }

    try {
      const url = new URL(`${NOMINATIM_URL}/search`);
      url.searchParams.set("q", q);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "10");
      url.searchParams.set("viewbox", BBOX_KAZAN);
      url.searchParams.set("bounded", "0");
      url.searchParams.set("addressdetails", "1");

      const resp = await fetchFn(url.toString(), {
        headers: { "Accept-Language": "ru", "User-Agent": "Poputchiki/1.0" },
        signal: AbortSignal.timeout(5000),
      });

      const results = await resp.json();
      cache.set(cacheKey, results);
      return c.json(results);
    } catch {
      // Раньше возвращали FALLBACK_RESULTS — но это подменяло пользовательский запрос
      // на захардкоженный список ("Москва" → "ЖК Царёво, Казань"). Лучше 503 + пустой
      // список: фронт показывает явную ошибку, юзер понимает что сервис не работает.
      c.header("Retry-After", "30");
      return c.json({ error: "geocoder_unavailable", results: [] }, 503);
    }
  });

  return app;
}
