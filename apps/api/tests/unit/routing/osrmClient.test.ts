import { describe, expect, it } from "vitest";
import { fetchRoute } from "../../../src/routing/osrmClient";

function mockFetch(body: unknown, status = 200) {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

const VALID_RESPONSE = {
  code: "Ok",
  routes: [
    {
      geometry: "mfp_I__vpAYBO@K@",
      distance: 1234.5,
      duration: 180.7,
    },
  ],
};

describe("fetchRoute", () => {
  it("returns route data on valid OSRM response", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch(VALID_RESPONSE),
    });
    expect(result).not.toBeNull();
    expect(result!.polyline).toBe("mfp_I__vpAYBO@K@");
    expect(result!.distanceM).toBe(1235);
    expect(result!.durationS).toBe(181);
    expect(result!.geometryWKT).toContain("LINESTRING(");
  });

  it("constructs correct OSRM URL with lng,lat order", async () => {
    let capturedUrl = "";
    const spy = (async (input: string | Request | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify(VALID_RESPONSE));
    }) as unknown as typeof fetch;
    await fetchRoute(55.8, 49.1, 55.9, 49.2, { _fetch: spy });
    expect(capturedUrl).toContain("/route/v1/driving/49.1,55.8;49.2,55.9");
  });

  it("uses custom baseUrl", async () => {
    let capturedUrl = "";
    const spy = (async (input: string | Request | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify(VALID_RESPONSE));
    }) as unknown as typeof fetch;
    await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      baseUrl: "http://custom:9999",
      _fetch: spy,
    });
    expect(capturedUrl).toContain("http://custom:9999/route/v1/driving/");
  });

  it("returns null on network error", async () => {
    const failFetch = (async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, { _fetch: failFetch });
    expect(result).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch({}, 500),
    });
    expect(result).toBeNull();
  });

  it("returns null on invalid JSON", async () => {
    const badFetch = (async () =>
      new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, { _fetch: badFetch });
    expect(result).toBeNull();
  });

  it("returns null when OSRM code is not Ok", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch({ code: "NoRoute", routes: [] }),
    });
    expect(result).toBeNull();
  });

  it("returns null when routes array is empty", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch({ code: "Ok", routes: [] }),
    });
    expect(result).toBeNull();
  });

  it("returns null when routes is undefined", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch({ code: "Ok" }),
    });
    expect(result).toBeNull();
  });

  it("generates valid WKT from decoded polyline", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch(VALID_RESPONSE),
    });
    expect(result).not.toBeNull();
    expect(result!.geometryWKT).toMatch(/^LINESTRING\(.+\)$/);
    const coordPairs = result!.geometryWKT.slice(11, -1).split(",");
    for (const pair of coordPairs) {
      const [lng, lat] = pair.trim().split(" ").map(Number);
      expect(lng).toBeGreaterThanOrEqual(-180);
      expect(lng).toBeLessThanOrEqual(180);
      expect(lat).toBeGreaterThanOrEqual(-90);
      expect(lat).toBeLessThanOrEqual(90);
    }
  });

  it("rounds distance and duration to integers", async () => {
    const result = await fetchRoute(55.8, 49.1, 55.9, 49.2, {
      _fetch: mockFetch(VALID_RESPONSE),
    });
    expect(result).not.toBeNull();
    expect(Number.isInteger(result!.distanceM)).toBe(true);
    expect(Number.isInteger(result!.durationS)).toBe(true);
  });
});
