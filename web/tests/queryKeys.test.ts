import { describe, expect, it } from "vitest";
import { queryKeys } from "../src/lib/queryKeys";

describe("queryKeys", () => {
  it("does not persist exact ride search coordinates in rides list keys", () => {
    const key = queryKeys.rides.list("24h", null, null, {
      fromLat: 55.755826,
      fromLng: 37.6173,
      radiusKm: 2,
    });

    const serialized = JSON.stringify(key);
    expect(serialized).not.toContain("55.755826");
    expect(serialized).not.toContain("37.6173");
    expect(serialized).not.toContain("fromLat");
    expect(serialized).not.toContain("fromLng");
    expect(serialized).toContain("nearby");
  });

  it("keeps spatial rides list keys distinct without exposing coordinates", () => {
    const firstKey = queryKeys.rides.list("24h", null, null, {
      fromLat: 55.755826,
      fromLng: 37.6173,
      radiusKm: 2,
    });
    const secondKey = queryKeys.rides.list("24h", null, null, {
      fromLat: 55.760001,
      fromLng: 37.620001,
      radiusKm: 2,
    });

    expect(secondKey).not.toEqual(firstKey);
    expect(JSON.stringify(secondKey)).not.toContain("55.760001");
    expect(JSON.stringify(secondKey)).not.toContain("37.620001");
  });
});
