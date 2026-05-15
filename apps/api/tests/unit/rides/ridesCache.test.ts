import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCache } from "../../../src/geocode/geoCache";

describe("GeoCache — rides use", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("возвращает сохранённое значение до истечения TTL", () => {
    const cache = new GeoCache(200, 5_000);
    cache.set("k", { rides: [], nextCursor: null });
    expect(cache.get("k")).toEqual({ rides: [], nextCursor: null });
  });

  it("возвращает undefined после истечения TTL", () => {
    const cache = new GeoCache(200, 5_000);
    cache.set("k", { rides: [], nextCursor: null });
    vi.advanceTimersByTime(5_001);
    expect(cache.get("k")).toBeUndefined();
  });

  it("FIFO eviction при maxSize", () => {
    const cache = new GeoCache(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.size()).toBe(2);
  });

  it("clear() сбрасывает все ключи", () => {
    const cache = new GeoCache(200, 60_000);
    cache.set("x", 1);
    cache.set("y", 2);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("x")).toBeUndefined();
  });
});
