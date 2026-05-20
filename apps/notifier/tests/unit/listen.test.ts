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
  // listenWithBackoff — вечный цикл reconnect-после-disconnect.
  // Тесты останавливают цикл через AbortController (без него worker зависает →
  // OOM при v8 coverage cumulative map).

  it("reconnects after disconnect (listenFn resolves without error)", async () => {
    const controller = new AbortController();
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls >= 3) controller.abort();
    });
    const onConnected = vi.fn();
    await listenWithBackoff(fn, {
      onConnected,
      _sleep: async () => {},
      abortSignal: controller.signal,
    });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onConnected).toHaveBeenCalledTimes(2);
  });

  it("resets attempt counter after successful reconnect", async () => {
    const controller = new AbortController();
    const slept: number[] = [];
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 2) throw new Error("transient");
      if (calls === 3) controller.abort();
    });
    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
      abortSignal: controller.signal,
    });
    expect(slept[0]).toBe(1000);
  });

  it("retries on error with exponential backoff delays", async () => {
    const controller = new AbortController();
    const slept: number[] = [];
    const fn = vi.fn().mockImplementation(async (): Promise<void> => {
      const n = fn.mock.calls.length;
      if (n === 1) throw new Error("fail 1");
      if (n === 2) throw new Error("fail 2");
      if (n === 3) return;
      controller.abort();
    });

    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
      abortSignal: controller.signal,
    });

    expect(slept[0]).toBe(1000);
    expect(slept[1]).toBe(2000);
  });

  it("calls onError with attempt index and delay", async () => {
    const controller = new AbortController();
    const errors: Array<{ attempt: number; delayMs: number }> = [];
    const fn = vi.fn().mockImplementation(async (): Promise<void> => {
      const n = fn.mock.calls.length;
      if (n === 1) throw new Error("fail");
      if (n === 2) return;
      controller.abort();
    });

    await listenWithBackoff(fn, {
      _sleep: async () => {},
      onError: (_err, attempt, delayMs) => {
        errors.push({ attempt, delayMs });
      },
      abortSignal: controller.signal,
    });

    expect(errors[0]).toEqual({ attempt: 0, delayMs: 1000 });
  });

  it("reaches cap delay after enough failures", async () => {
    const controller = new AbortController();
    const slept: number[] = [];
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls <= 6) throw new Error("fail");
    });

    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
        if (slept.length >= 6) controller.abort();
      },
      abortSignal: controller.signal,
    });

    expect(slept[4]).toBe(16000);
    expect(slept[5]).toBe(30000);
  });

  // Branch line 40: `if (abortSignal?.aborted) return;` в catch — true-path.
  // Аборт внутри listenFn перед throw → catch видит aborted=true → return.
  it("abort внутри listenFn перед throw → catch выходит немедленно (line 40 true-path)", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
      throw new Error("transient");
    });
    const onError = vi.fn();
    const sleep = vi.fn(async () => {});
    await listenWithBackoff(fn, {
      _sleep: sleep,
      onError,
      abortSignal: controller.signal,
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(sleep).not.toHaveBeenCalled();
  });

  // Покрытие optional chaining `abortSignal?.aborted` когда abortSignal undefined.
  // Без abortSignal остановить infinite loop можно только через throw в _sleep
  // или listenFn — _sleep throw пробрасывается наружу, разворачивая цикл.
  it("без abortSignal — loop разворачивается throw из _sleep после reconnect", async () => {
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) return;
      throw new Error("transient");
    });
    const stop = new Error("stop loop");
    await expect(
      listenWithBackoff(fn, {
        _sleep: async () => {
          throw stop;
        },
      }),
    ).rejects.toBe(stop);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
