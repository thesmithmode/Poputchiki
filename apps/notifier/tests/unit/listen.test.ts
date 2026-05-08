import { describe, expect, it, vi } from "vitest";
import { BACKOFF_DELAYS_MS, backoffDelayMs, listenWithBackoff } from "../../src/listen";

describe("backoffDelayMs", () => {
  it("returns 1000 for attempt 0", () => {
    expect(backoffDelayMs(0)).toBe(1000);
  });

  it("returns 2000 for attempt 1", () => {
    expect(backoffDelayMs(1)).toBe(2000);
  });

  it("returns 4000 for attempt 2", () => {
    expect(backoffDelayMs(2)).toBe(4000);
  });

  it("returns 8000 for attempt 3", () => {
    expect(backoffDelayMs(3)).toBe(8000);
  });

  it("returns 16000 for attempt 4", () => {
    expect(backoffDelayMs(4)).toBe(16000);
  });

  it("caps at 30000 for attempt 5", () => {
    expect(backoffDelayMs(5)).toBe(30000);
  });

  it("stays at 30000 for any attempt >= 5", () => {
    expect(backoffDelayMs(10)).toBe(30000);
    expect(backoffDelayMs(100)).toBe(30000);
  });

  it("BACKOFF_DELAYS_MS has 6 entries ending at 30000", () => {
    expect(BACKOFF_DELAYS_MS).toHaveLength(6);
    expect(BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1]).toBe(30000);
  });
});

describe("listenWithBackoff", () => {
  it("calls listenFn once on first success", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await listenWithBackoff(fn);
    expect(fn).toHaveBeenCalledOnce();
  });

  it("calls onConnected after success", async () => {
    const onConnected = vi.fn();
    const fn = vi.fn().mockResolvedValue(undefined);
    await listenWithBackoff(fn, { onConnected });
    expect(onConnected).toHaveBeenCalledOnce();
  });

  it("retries on error with exponential backoff delays", async () => {
    const slept: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue(undefined);

    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
    });

    expect(fn).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([1000, 2000]);
  });

  it("calls onError with attempt index and delay", async () => {
    const errors: Array<{ attempt: number; delayMs: number }> = [];
    const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValue(undefined);

    await listenWithBackoff(fn, {
      _sleep: async () => {},
      onError: (_err, attempt, delayMs) => {
        errors.push({ attempt, delayMs });
      },
    });

    expect(errors).toEqual([{ attempt: 0, delayMs: 1000 }]);
  });

  it("reaches cap delay after enough failures", async () => {
    const slept: number[] = [];
    const failCount = 6;
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls <= failCount) throw new Error("fail");
    });

    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
    });

    expect(slept[4]).toBe(16000);
    expect(slept[5]).toBe(30000);
  });
});
