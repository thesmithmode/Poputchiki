import { describe, expect, it } from "vitest";
import { isAtOrAfterUtcTime } from "../../src/lib/daily-window";

describe("isAtOrAfterUtcTime", () => {
  it("keeps user_notifications cleanup eligible after 02:30 even when hourly tick misses the half-hour", () => {
    expect(isAtOrAfterUtcTime(new Date("2026-01-01T02:15:00Z"), 2, 30)).toBe(false);
    expect(isAtOrAfterUtcTime(new Date("2026-01-01T02:30:00Z"), 2, 30)).toBe(true);
    expect(isAtOrAfterUtcTime(new Date("2026-01-01T03:15:00Z"), 2, 30)).toBe(true);
  });
});
