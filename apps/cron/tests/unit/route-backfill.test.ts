import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillRoutes } from "../../src/route-backfill";

type Row = Record<string, unknown>;

function makeSql(responses: Row[][]): import("postgres").Sql {
  const calls: string[] = [];
  const tag = vi.fn().mockImplementation((strings: TemplateStringsArray, ..._values: unknown[]) => {
    if (!Array.isArray(strings)) return String(strings);
    const query = strings.join("?");
    calls.push(query);
    if (query.includes("SET LOCAL ROLE")) return Promise.resolve([]);
    return Promise.resolve(responses.shift() ?? []);
  });
  const sql = tag as typeof tag & {
    begin: (fn: (tx: typeof tag) => Promise<unknown>) => Promise<unknown>;
    calls: string[];
  };
  sql.begin = vi.fn(async (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag));
  sql.calls = calls;
  return sql as unknown as import("postgres").Sql;
}

function osrmFetch(): typeof fetch {
  return vi.fn(async (url: string | URL | Request) => {
    const u = String(url);
    if (u.includes("geometries=polyline")) {
      return new Response(
        JSON.stringify({
          code: "Ok",
          routes: [{ geometry: "mfp_I__vpAYBO@K@", distance: 1234.4, duration: 567.2 }],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [49.44, 55.81],
                [49.12, 55.79],
              ],
            },
            distance: 1234.4,
            duration: 567.2,
          },
        ],
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
}

describe("backfillRoutes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fills missing route fields for active templates and active rides", async () => {
    const sql = makeSql([
      [{ id: "tmpl-1", from_lat: 55.81, from_lng: 49.44, to_lat: 55.79, to_lng: 49.12 }],
      [{ id: "tmpl-1" }],
      [{ id: "ride-1", from_lat: 55.82, from_lng: 49.43, to_lat: 55.78, to_lng: 49.11 }],
      [{ id: "ride-1" }],
    ]);

    const result = await backfillRoutes(sql, { fetchFn: osrmFetch(), limit: 10 });

    expect(result).toEqual({
      templatesChecked: 1,
      templatesUpdated: 1,
      ridesChecked: 1,
      ridesUpdated: 1,
      failed: 0,
    });
    const calls = (sql as unknown as { calls: string[] }).calls.join("\n");
    expect(calls).toContain("SET LOCAL ROLE poputchiki_service");
    expect(calls).toContain("FROM ride_templates");
    expect(calls).toContain("FROM rides");
    expect(calls).toContain("route_polyline = ?");
  });

  it("does not throw when OSRM is unavailable and keeps route rows for next run", async () => {
    const sql = makeSql([
      [{ id: "ride-1", from_lat: 55.82, from_lng: 49.43, to_lat: 55.78, to_lng: 49.11 }],
      [],
    ]);
    const fetchFn = vi.fn(async () => {
      throw new Error("osrm down");
    }) as unknown as typeof fetch;

    const result = await backfillRoutes(sql, { fetchFn, limit: 10, includeTemplates: false });

    expect(result).toEqual({
      templatesChecked: 0,
      templatesUpdated: 0,
      ridesChecked: 1,
      ridesUpdated: 0,
      failed: 1,
    });
    expect((sql as unknown as { calls: string[] }).calls.join("\n")).not.toContain("UPDATE rides");
  });

  it("uses default OSRM env, timeout, fetch, and can skip rides", async () => {
    vi.stubEnv("OSRM_URL", "http://osrm-env:5000");
    const fetchFn = osrmFetch();
    vi.stubGlobal("fetch", fetchFn);
    const sql = makeSql([
      [{ id: "tmpl-1", from_lat: 55.81, from_lng: 49.44, to_lat: 55.79, to_lng: 49.12 }],
      [{ id: "tmpl-1" }],
    ]);

    const result = await backfillRoutes(sql, { includeRides: false });

    expect(result).toEqual({
      templatesChecked: 1,
      templatesUpdated: 1,
      ridesChecked: 0,
      ridesUpdated: 0,
      failed: 0,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      expect.stringContaining("http://osrm-env:5000/route/v1/driving/"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect((sql as unknown as { calls: string[] }).calls.join("\n")).not.toContain("FROM rides");
  });

  it("counts OSRM non-ok responses as retryable failures without updates", async () => {
    const sql = makeSql([
      [{ id: "ride-1", from_lat: 55.82, from_lng: 49.43, to_lat: 55.78, to_lng: 49.11 }],
    ]);
    const fetchFn = vi.fn(async () => new Response("bad gateway", { status: 502 }));

    const result = await backfillRoutes(sql, {
      fetchFn: fetchFn as unknown as typeof fetch,
      includeTemplates: false,
    });

    expect(result).toEqual({
      templatesChecked: 0,
      templatesUpdated: 0,
      ridesChecked: 1,
      ridesUpdated: 0,
      failed: 1,
    });
    expect((sql as unknown as { calls: string[] }).calls.join("\n")).not.toContain("UPDATE rides");
  });

  it("does not count an update when another worker already filled the route", async () => {
    const sql = makeSql([
      [{ id: "ride-1", from_lat: 55.82, from_lng: 49.43, to_lat: 55.78, to_lng: 49.11 }],
      [],
    ]);

    const result = await backfillRoutes(sql, {
      fetchFn: osrmFetch(),
      includeTemplates: false,
      limit: 1,
    });

    expect(result).toEqual({
      templatesChecked: 0,
      templatesUpdated: 0,
      ridesChecked: 1,
      ridesUpdated: 0,
      failed: 0,
    });
    expect((sql as unknown as { calls: string[] }).calls.join("\n")).toContain("UPDATE");
  });

  it("backfills active rides with partial route fields, not only missing polylines", async () => {
    const sql = makeSql([
      [{ id: "ride-1", from_lat: 55.82, from_lng: 49.43, to_lat: 55.78, to_lng: 49.11 }],
      [{ id: "ride-1" }],
    ]);

    const result = await backfillRoutes(sql, {
      fetchFn: osrmFetch(),
      includeTemplates: false,
      limit: 1,
    });

    expect(result.ridesUpdated).toBe(1);
    const calls = (sql as unknown as { calls: string[] }).calls.join("\n");
    expect(calls).toContain("route_duration_s IS NULL");
    expect(calls).toContain("route_distance_m IS NULL");
  });
});
