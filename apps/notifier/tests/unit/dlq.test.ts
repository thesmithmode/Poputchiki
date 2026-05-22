import { describe, expect, it } from "vitest";
import { BASE_BACKOFF_MS, MAX_BACKOFF_MS, backoffMs } from "../../src/dlq.js";

describe("backoffMs (exponential capped)", () => {
  it("attempts=0 или 1 → BASE_BACKOFF_MS (30s)", () => {
    expect(backoffMs(0)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
  });

  it("экспоненциальный рост: 1→30s, 2→60s, 3→120s, 4→240s", () => {
    expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2); // 60s
    expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4); // 120s
    expect(backoffMs(4)).toBe(BASE_BACKOFF_MS * 8); // 240s
  });

  it("cap на MAX_BACKOFF_MS (1h)", () => {
    expect(backoffMs(20)).toBe(MAX_BACKOFF_MS);
    expect(backoffMs(100)).toBe(MAX_BACKOFF_MS);
  });

  it("attempts=8 (MAX_ATTEMPTS) → больше или равно cap", () => {
    expect(backoffMs(8)).toBeLessThanOrEqual(MAX_BACKOFF_MS);
  });
});
