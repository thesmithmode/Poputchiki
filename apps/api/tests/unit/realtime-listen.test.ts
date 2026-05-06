import { describe, expect, it, vi } from "vitest";
import { BACKOFF_DELAYS_MS, backoffDelayMs, listenWithBackoff } from "../../src/realtime/listen";

describe("backoffDelayMs (api/realtime)", () => {
  it("returns 1000 for attempt 0", () => expect(backoffDelayMs(0)).toBe(1000));
  it("returns 2000 for attempt 1", () => expect(backoffDelayMs(1)).toBe(2000));
  it("caps at 30000 for attempt >= 5", () => {
    expect(backoffDelayMs(5)).toBe(30000);
    expect(backoffDelayMs(99)).toBe(30000);
  });
  it("BACKOFF_DELAYS_MS has 6 entries", () => expect(BACKOFF_DELAYS_MS).toHaveLength(6));
});

describe("listenWithBackoff (api/realtime)", () => {
  it("resolves on first success", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await listenWithBackoff(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("retries with exponential delays on failure", async () => {
    const slept: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);

    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(slept).toEqual([1000, 2000]);
  });
});
