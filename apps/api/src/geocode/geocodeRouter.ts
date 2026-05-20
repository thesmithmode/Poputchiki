import { Hono } from "hono";
import { z } from "zod";
import type { AppUser } from "../middleware/identity-guard";
import { GeoCache } from "./geoCache";

// M6: runtime-валидация Nominatim ответов. Без неё внешний сервис мог вернуть
// {error: "..."} или null или массив с произвольной структурой — клиент получал
// нефильтрованный raw. Schema режет лишние поля + проверяет тип lat/lon.
const NominatimSearchItem = z
  .object({
    place_id: z.union([z.number(), z.string()]).optional(),
    display_name: z.string().optional(),
    lat: z.string(),
    lon: z.string(),
    type: z.string().optional(),
    address: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
const NominatimSearchResponse = z.array(NominatimSearchItem);

const NominatimReverseResponse = z
  .object({
    display_name: z.string().optional(),
    lat: z.string().optional(),
    lon: z.string().optional(),
  })
  .passthrough();

// Public Nominatim by default — self-hosted профиль в compose отключён.
// Policy public Nominatim: 1 req/sec per IP + обязательный User-Agent (ставим ниже).
// Свой кэш + per-user rate-limit ниже снижают нагрузку на их инфру.
const NOMINATIM_DEFAULT = "https://nominatim.openstreetmap.org";

// Public Nominatim: 1 req/sec policy. Self-hosted (например http://nominatim:8080 в compose) —
// свой инстанс, безопасно держать ~10 rps на пользователя.
const PUBLIC_NOMINATIM_HOST = "nominatim.openstreetmap.org";
function rateLimitIntervalMs(nominatimUrl: string): number {
  try {
    const host = new URL(nominatimUrl).host;
    return host === PUBLIC_NOMINATIM_HOST ? 1000 : 100;
  } catch {
    return 1000;
  }
}

// Рабочая зона: Казань + ЖК Царёво + аэропорт + окрестности до Старо��о Шигалеево.
// Nominatim viewbox формат: left(min_lon),top(max_lat),right(max_lon),bottom(min_lat)
const BBOX_KAZAN_AREA = "48.5,56.2,50.0,55.3";

// bounded=1 у Nominatim advisory — при пустом resultset он может вернуть
// результаты за пределами viewbox (Москва, Питер итд.). Хард-фильтр гарантирует зону.
const LAT_MIN = 55.3;
const LAT_MAX = 56.2;
const LON_MIN = 48.5;
const LON_MAX = 50.0;
function inKazanArea(lat: number, lon: number): boolean {
  return lat >= LAT_MIN && lat <= LAT_MAX && lon >= LON_MIN && lon <= LON_MAX;
}

// "Тукая 31", "ул. Тукая, д. 31", "г.Тукая 31" → { street: "Тукая 31" }.
// Если совпало — используем structured search Nominatim с village/county/state, чтобы
// public-инстанс не выдавал "ул. Тукая" из других городов России.
const TSAREVO_STREET_RE =
  /(?:^|\s)(?:ул\.?|улица|г\.?|город)?\s*(?:габдуллы\s+)?тук[ао]я\s*,?\s*(?:д\.?|дом)?\s*(\d+[а-я]?)\b/i;

interface ParsedQuery {
  structured: boolean;
  params: Record<string, string>;
}

function parseQuery(q: string): ParsedQuery {
  const m = q.match(TSAREVO_STREET_RE);
  if (m) {
    return {
      structured: true,
      params: {
        street: `Тукая ${m[1]}`,
        village: "Новое Шигалеево",
        county: "Пестречинский район",
        state: "Татарстан",
        country: "Россия",
      },
    };
  }
  return { structured: false, params: { q } };
}

function buildSearchUrl(nominatimUrl: string, q: string): URL {
  const url = new URL(`${nominatimUrl}/search`);
  const parsed = parseQuery(q);
  for (const [k, v] of Object.entries(parsed.params)) {
    url.searchParams.set(k, v);
  }
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "12");
  url.searchParams.set("viewbox", BBOX_KAZAN_AREA);
  url.searchParams.set("bounded", "1");
  url.searchParams.set("addressdetails", "1");
  return url;
}

interface GeocodeRouterOptions {
  cache?: GeoCache | undefined;
  _fetch?: typeof fetch | undefined;
  _lastRequestAt?: Map<string, number> | undefined;
  _nominatimUrl?: string | undefined;
}

// H1 (review 2026-05-20 apps-api): чистка Map выше этого порога чтобы предотвратить
// неограниченный рост памяти при 50k DAU. amortized O(1) на запрос.
const RATE_LIMIT_MAP_EVICT_THRESHOLD = 1000;

function evictExpiredRateLimits(map: Map<string, number>, now: number, rateMs: number): void {
  if (map.size <= RATE_LIMIT_MAP_EVICT_THRESHOLD) return;
  const ttl = Math.max(rateMs * 10, 60_000);
  for (const [k, t] of map) {
    if (now - t > ttl) map.delete(k);
  }
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

    const nominatimUrl = options._nominatimUrl ?? process.env.NOMINATIM_URL ?? NOMINATIM_DEFAULT;
    const rateMs = rateLimitIntervalMs(nominatimUrl);
    const now = Date.now();
    evictExpiredRateLimits(lastRequestAt, now, rateMs);
    const lastAt = lastRequestAt.get(user.id) ?? 0;
    if (now - lastAt < rateMs) {
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
      const url = buildSearchUrl(nominatimUrl, q);

      const resp = await fetchFn(url.toString(), {
        headers: { "Accept-Language": "ru", "User-Agent": "Poputchiki/1.0" },
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) throw new Error(`nominatim_status_${resp.status}`);
      const raw = await resp.json();
      const parsed = NominatimSearchResponse.safeParse(raw);
      if (!parsed.success) throw new Error("nominatim_bad_shape");
      const results = parsed.data.filter((r) => {
        const lat = Number(r.lat);
        const lon = Number(r.lon);
        return !Number.isNaN(lat) && !Number.isNaN(lon) && inKazanArea(lat, lon);
      });
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

  app.get("/reverse", async (c) => {
    const user = c.get("user" as never) as AppUser | undefined;
    if (!user) return c.json({ error: "unauthorized" }, 401);

    const lat = Number(c.req.query("lat"));
    const lon = Number(c.req.query("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return c.json({ error: "lat/lon required" }, 400);
    }
    if (!inKazanArea(lat, lon)) {
      return c.json({ error: "out_of_area" }, 400);
    }

    const nominatimUrl = options._nominatimUrl ?? process.env.NOMINATIM_URL ?? NOMINATIM_DEFAULT;
    const rateMs = rateLimitIntervalMs(nominatimUrl);
    const now = Date.now();
    evictExpiredRateLimits(lastRequestAt, now, rateMs);
    const lastAt = lastRequestAt.get(user.id) ?? 0;
    if (now - lastAt < rateMs) {
      c.header("Retry-After", "1");
      return c.json({ error: "rate limit exceeded" }, 429);
    }
    lastRequestAt.set(user.id, now);

    const cacheKey = `rev:${lat.toFixed(5)}:${lon.toFixed(5)}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return c.json(cached);

    try {
      const url = new URL(`${nominatimUrl}/reverse`);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("format", "json");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("zoom", "18");

      const resp = await fetchFn(url.toString(), {
        headers: { "Accept-Language": "ru", "User-Agent": "Poputchiki/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) throw new Error(`nominatim_status_${resp.status}`);
      const raw = await resp.json();
      const parsed = NominatimReverseResponse.safeParse(raw);
      if (!parsed.success) throw new Error("nominatim_bad_shape");
      const result = {
        display_name: parsed.data.display_name ?? `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        lat: parsed.data.lat ?? String(lat),
        lon: parsed.data.lon ?? String(lon),
      };
      cache.set(cacheKey, result);
      return c.json(result);
    } catch {
      c.header("Retry-After", "30");
      return c.json({ error: "geocoder_unavailable" }, 503);
    }
  });

  return app;
}
