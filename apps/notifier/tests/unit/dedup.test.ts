import { describe, expect, it } from "vitest";
import { buildDedupKey, checkAndSet } from "../../src/dedup.js";
import type { NotifyPayload } from "../../src/types.js";

describe("buildDedupKey", () => {
  it("uses target_id when present", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system", target_id: "t1" };
    expect(buildDedupKey(p)).toContain("t1");
  });

  it("falls back to message_id", () => {
    const p: NotifyPayload = { user_id: "u1", category: "support_reply", message_id: "m1" };
    expect(buildDedupKey(p)).toContain("m1");
  });

  it("falls back to ride_id", () => {
    const p: NotifyPayload = { user_id: "u1", category: "ride_request", ride_id: "r1" };
    expect(buildDedupKey(p)).toContain("r1");
  });

  it("uses empty string when no id fields", () => {
    const p: NotifyPayload = { user_id: "u1", category: "like_received" };
    const key = buildDedupKey(p);
    expect(key).toMatch(/^u1:like_received::/);
  });

  it("includes today date", () => {
    const p: NotifyPayload = { user_id: "u1", category: "system" };
    const today = new Date().toISOString().slice(0, 10);
    expect(buildDedupKey(p)).toContain(today);
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
    const past = Date.now() - 1; // already expired
    cache.set("k1", past);
    // Now TTL has passed — checkAndSet with current time should see it expired
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
