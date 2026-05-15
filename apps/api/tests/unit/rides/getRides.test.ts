import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCache } from "../../../src/geocode/geoCache";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
  withSystem: vi.fn(),
}));

import { withIdentity } from "../../../src/db/with-identity";
import { readJson } from "../../helpers/json";

const USER: AppUser = {
  id: "00000000-0000-4000-a000-000000000001",
  tgId: 1001,
  role: "user",
};

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function makeApp(user: AppUser = USER, cache?: GeoCache) {
  const app = new Hono();
  app.use("/rides/*", async (c, next) => {
    c.set("user" as never, user);
    await next();
  });
  app.route("/rides", createRidesRouter(mockSql, cache ?? new GeoCache(200, 5_000)));
  return app;
}

function makeRide(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    driver_id: USER.id,
    from_label: "From",
    from_lat: 55.75,
    from_lng: 37.61,
    to_label: "To",
    to_lat: 55.8,
    to_lng: 37.65,
    departure_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    seats_total: 2,
    seats_taken: 0,
    status: "active",
    price_rub: null,
    comment: null,
    template_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("GET /rides — basic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("empty result → 200 with rides:[] nextCursor:null", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce([] as any);
    const app = makeApp();
    const res = await app.request("/rides");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("fewer than 50 rides → no nextCursor", async () => {
    const rides = Array.from({ length: 5 }, () => makeRide());
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(rides as any);
    const app = makeApp();
    const res = await app.request("/rides");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(5);
    expect(body.nextCursor).toBeNull();
  });

  it("exactly 51 rides → 50 returned + nextCursor set", async () => {
    const rides = Array.from({ length: 51 }, (_, i) =>
      makeRide({
        departure_at: new Date(Date.now() + (i + 1) * 60 * 60 * 1000).toISOString(),
      }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(rides as any);
    const app = makeApp();
    const res = await app.request("/rides");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(50);
    expect(typeof body.nextCursor).toBe("string");
    expect(body.nextCursor.length).toBeGreaterThan(0);
  });

  it("encodeCursor uses ISO 8601 when departure_at is a Date (preserves ms)", async () => {
    // postgres-js returns timestamptz as JS Date; cursor must round-trip with
    // millisecond precision so the boundary row doesn't reappear on next page.
    const ms = Date.now() + 60 * 60 * 1000 + 123; // .123 ms
    const date = new Date(ms);
    const rides = Array.from({ length: 51 }, (_, i) =>
      makeRide({
        // Last ride (index 49 after slice) has a real Date object
        departure_at: i === 49 ? (date as unknown as string) : new Date(ms + (i + 1) * 1000),
      }),
    );
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(rides as any);
    const app = makeApp();
    const res = await app.request("/rides");
    const body = await readJson(res);
    const padded = body.nextCursor.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(padded));
    expect(decoded.d).toBe(date.toISOString());
    expect(decoded.d).toMatch(/\.\d{3}Z$/);
  });

  it("cursor param forwarded to withIdentity call", async () => {
    // Build a valid cursor
    const ride = makeRide();
    const cursor = btoa(JSON.stringify({ d: ride.departure_at, i: ride.id }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce([] as any);
    const app = makeApp();
    const res = await app.request(`/rides?cursor=${cursor}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(withIdentity)).toHaveBeenCalledOnce();
  });

  it("invalid cursor → 400", async () => {
    const app = makeApp();
    const res = await app.request("/rides?cursor=not-valid-base64-json!!!");
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid cursor");
  });

  it("invalid query param (bad radiusKm) → 422", async () => {
    const app = makeApp();
    const res = await app.request("/rides?radiusKm=-1");
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("validation failed");
  });
});

describe("GET /rides — кэш", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("второй запрос с теми же фильтрами не идёт в DB", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValue([] as any);
    const cache = new GeoCache(200, 5_000);
    const app = makeApp(USER, cache);
    await app.request("/rides");
    await app.request("/rides");
    expect(vi.mocked(withIdentity)).toHaveBeenCalledOnce();
  });

  it("favoritesOnly=true — кэш пропускается, каждый запрос идёт в DB", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValue([] as any);
    const cache = new GeoCache(200, 5_000);
    const app = makeApp(USER, cache);
    await app.request("/rides?favoritesOnly=true");
    await app.request("/rides?favoritesOnly=true");
    expect(vi.mocked(withIdentity)).toHaveBeenCalledTimes(2);
  });

  it("cursor присутствует — кэш пропускается", async () => {
    const ride = makeRide();
    const cursor = btoa(JSON.stringify({ d: ride.departure_at, i: ride.id }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValue([] as any);
    const cache = new GeoCache(200, 5_000);
    const app = makeApp(USER, cache);
    await app.request(`/rides?cursor=${cursor}`);
    await app.request(`/rides?cursor=${cursor}`);
    expect(vi.mocked(withIdentity)).toHaveBeenCalledTimes(2);
  });

  it("разные фильтры — разные cache-ключи, DB вызывается на каждый уникальный набор", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValue([] as any);
    const cache = new GeoCache(200, 5_000);
    const app = makeApp(USER, cache);
    await app.request("/rides?priceMax=100");
    await app.request("/rides?priceMax=200");
    expect(vi.mocked(withIdentity)).toHaveBeenCalledTimes(2);
  });

  it("SENTINEL: разные юзеры — разные cache-ключи (нет leak ответа между юзерами)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValue([makeRide()] as any);
    const cache = new GeoCache(200, 5_000);
    const userA: AppUser = {
      id: "00000000-0000-4000-a000-00000000000a",
      tgId: 2001,
      role: "user",
    };
    const userB: AppUser = {
      id: "00000000-0000-4000-a000-00000000000b",
      tgId: 2002,
      role: "user",
    };
    const appA = makeApp(userA, cache);
    const appB = makeApp(userB, cache);
    await appA.request("/rides");
    await appB.request("/rides");
    // Same query string but different user → no cache hit for B → DB called twice
    expect(vi.mocked(withIdentity)).toHaveBeenCalledTimes(2);
  });
});
