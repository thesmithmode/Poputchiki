import { describe, expect, it } from "vitest";
import { LruDedup } from "../../src/lib/lru-dedup";

describe("LruDedup", () => {
  it("returns false for unknown id", () => {
    const dedup = new LruDedup();
    expect(dedup.has(1)).toBe(false);
  });

  it("returns true after add", () => {
    const dedup = new LruDedup();
    dedup.add(42);
    expect(dedup.has(42)).toBe(true);
  });

  it("returns false after TTL expires", () => {
    const originalNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;

    try {
      const dedup = new LruDedup(10_000, 1000);
      dedup.add(99);
      expect(dedup.has(99)).toBe(true);

      fakeNow += 2000;
      expect(dedup.has(99)).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  it("evicts oldest entry when maxSize reached", () => {
    const dedup = new LruDedup(3);
    dedup.add(1);
    dedup.add(2);
    dedup.add(3);
    dedup.add(4);
    expect(dedup.has(1)).toBe(false);
    expect(dedup.has(2)).toBe(true);
    expect(dedup.has(3)).toBe(true);
    expect(dedup.has(4)).toBe(true);
  });

  it("does not evict when below maxSize", () => {
    const dedup = new LruDedup(5);
    dedup.add(10);
    dedup.add(20);
    expect(dedup.has(10)).toBe(true);
    expect(dedup.has(20)).toBe(true);
  });

  // maxSize=0: на add() map.size >= 0 = true, но map пустая → oldest undefined.
  // Покрывает branch `if (oldest !== undefined)` на line 20 (false-path).
  it("maxSize=0 — add() не падает на пустой карте (oldest undefined)", () => {
    const dedup = new LruDedup(0);
    expect(() => dedup.add(1)).not.toThrow();
    expect(dedup.has(1)).toBe(true);
  });
});
