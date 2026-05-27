import { describe, expect, it, vi } from "vitest";
import { clearRouteFields, saveRouteFields } from "../../../src/routing/routePersistence";

const { mockTx } = vi.hoisted(() => ({
  mockTx: vi.fn((strings: TemplateStringsArray | string, ..._values: unknown[]) => {
    if (!Array.isArray(strings)) return String(strings);
    return Promise.resolve([{ id: "row-1" }]);
  }),
}));

vi.mock("../../../src/db/with-identity", () => ({
  withSystem: vi.fn(async (_sql, fn) => fn(mockTx)),
}));

describe("routePersistence", () => {
  it("saves route fields through withSystem so RLS cannot drop the update", async () => {
    const { withSystem } = await import("../../../src/db/with-identity");
    mockTx.mockClear();

    const saved = await saveRouteFields({} as never, "rides", "row-1", {
      polyline: "mfp_I__vpAYBO@K@",
      geometryWKT: "LINESTRING(49.44 55.81,49.12 55.79)",
      distanceM: 1234,
      durationS: 567,
    });

    expect(saved).toBe(true);
    expect(withSystem).toHaveBeenCalledOnce();
    const update = mockTx.mock.calls
      .map((call) => (Array.isArray(call[0]) ? (call[0] as string[]).join("") : ""))
      .find((query) => query.includes("UPDATE") && query.includes("route_polyline"));
    expect(update).toBeDefined();
  });

  it("clears route fields through withSystem", async () => {
    const { withSystem } = await import("../../../src/db/with-identity");
    mockTx.mockClear();
    vi.mocked(withSystem).mockClear();

    const cleared = await clearRouteFields({} as never, "ride_templates", "row-1");

    expect(cleared).toBe(true);
    expect(withSystem).toHaveBeenCalledOnce();
    const update = mockTx.mock.calls
      .map((call) => (Array.isArray(call[0]) ? (call[0] as string[]).join("") : ""))
      .find((query) => query.includes("UPDATE") && query.includes("route_polyline = NULL"));
    expect(update).toBeDefined();
  });
});
