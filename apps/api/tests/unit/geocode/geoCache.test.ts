import { describe, expect, it } from "vitest";
import { GeoCache } from "../../../src/geocode/geoCache";

describe("GeoCache", () => {
  it("returns undefined for missing key", () => {
    const cache = new GeoCache();
    expect(cache.get("x")).toBeUndefined();
  });

  it("returns stored value", () => {
    const cache = new GeoCache();
    cache.set("q", [{ place_id: 1 }]);
    expect(cache.get("q")).toEqual([{ place_id: 1 }]);
  });

  it("evicts expired entries", () => {
    const cache = new GeoCache(1000, 0); // ttl=0 → immediate expiry
    cache.set("q", [{ place_id: 1 }]);
    expect(cache.get("q")).toBeUndefined();
  });

  it("evicts oldest entry when at capacity", () => {
    const cache = new GeoCache(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3); // evicts "a"
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
  });

  it("size does not exceed maxSize", () => {
    const cache = new GeoCache(3, 60_000);
    for (let i = 0; i < 10; i++) cache.set(`k${i}`, i);
    expect(cache.size()).toBeLessThanOrEqual(3);
  });

  it("rejects keys over maxKeyBytes", () => {
    const cache = new GeoCache(10, 60_000, { maxKeyBytes: 4 });
    cache.set("12345", 1);
    expect(cache.size()).toBe(0);
    expect(cache.get("12345")).toBeUndefined();
  });

  it("rejects values over maxValueBytes", () => {
    const cache = new GeoCache(10, 60_000, { maxValueBytes: 10 });
    cache.set("q", { value: "x".repeat(20) });
    expect(cache.size()).toBe(0);
    expect(cache.get("q")).toBeUndefined();
  });
});
