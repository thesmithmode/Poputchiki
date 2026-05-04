import { describe, expect, it } from "vitest";
import { buildDedupKey, checkAndSet } from "../../src/dedup.js";
import type { NotifyPayload } from "../../src/types.js";

const NOW = 1_700_000_000_000; // fixed timestamp for deterministic tests

describe("buildDedupKey", () => {
  it("returns 64-char hex string", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system" };
    expect(buildDedupKey(p, NOW)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("same inputs → same key", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system", target_id: "t1" };
    expect(buildDedupKey(p, NOW)).toBe(buildDedupKey(p, NOW));
  });

  it("different target_id → different key", () => {
    const base = { user_id: "u1", category: "system" as const };
    const k1 = buildDedupKey({ ...base, target_id: "t1" }, NOW);
    const k2 = buildDedupKey({ ...base, target_id: "t2" }, NOW);
    expect(k1).not.toBe(k2);
  });

  it("falls back to message_id when no target_id", () => {
    const p1: NotifyPayload = { user_id: "u1", category: "support_reply", message_id: "m1" };
    const p2: NotifyPayload = { user_id: "u1", category: "support_reply", message_id: "m2" };
    expect(buildDedupKey(p1, NOW)).not.toBe(buildDedupKey(p2, NOW));
  });

  it("different 5-min windows → different key", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system" };
    const window1 = NOW;
    const window2 = NOW + 5 * 60 * 1000; // +5 minutes
    expect(buildDedupKey(p, window1)).not.toBe(buildDedupKey(p, window2));
  });

  it("same 5-min window → same key", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system" };
    const t1 = NOW;
    const t2 = NOW + 60_000; // +1 min, still same window
    expect(buildDedupKey(p, t1)).toBe(buildDedupKey(p, t2));
  });
});

describe("checkAndSet", () => {
  it("returns true on first call", () => {
    const cache = new Map<string, number>();
    expect(checkAndSet(cache, "k1")).toBe(true);
  });

  it("returns false on duplicate within TTL", () => {
    const cache = new Map<string, number>();
    checkAndSet(cache, "k1");
    expect(checkAndSet(cache, "k1")).toBe(false);
  });

  it("returns true after TTL expired", () => {
    const cache = new Map<string, number>();
    const past = Date.now() - 1;
    cache.set("k1", past);
    expect(checkAndSet(cache, "k1", Date.now())).toBe(true);
  });

  it("cleans up expired entries", () => {
    const cache = new Map<string, number>();
    cache.set("old", Date.now() - 1);
    checkAndSet(cache, "new_key");
    expect(cache.has("old")).toBe(false);
  });

  it("different keys are independent", () => {
    const cache = new Map<string, number>();
    expect(checkAndSet(cache, "a")).toBe(true);
    expect(checkAndSet(cache, "b")).toBe(true);
    expect(checkAndSet(cache, "a")).toBe(false);
  });
});
