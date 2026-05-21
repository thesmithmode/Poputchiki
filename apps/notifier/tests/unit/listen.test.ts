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
  // postgres.js .listen() возвращает Promise, который резолвится один раз после ACK
  // LISTEN-команды; reconnect после disconnect библиотека делает сама через onclose-хук.
  // Поэтому listenWithBackoff завершается успехом после первого resolve listenFn —
  // НЕ зацикливается. Регрессия 9a6a184 (attempt=0 вместо return) вызывала tight loop
  // → CPU 100% → OOM → crash-loop в prod (notifier перестал доставлять TG-сообщения).

  it("успешный listenFn вызывается ровно один раз и возвращает", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    const onConnected = vi.fn();
    await listenWithBackoff(fn, { onConnected, _sleep: async () => {} });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it("успех без onConnected — promise завершается (optional callback)", async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    await listenWithBackoff(fn, { _sleep: async () => {} });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("после ошибки backoff retry → успех завершает loop", async () => {
    const slept: number[] = [];
    let calls = 0;
    const fn = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) throw new Error("transient");
    });
    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(slept).toEqual([1000]);
  });

  it("retry on error с exponential backoff", async () => {
    const slept: number[] = [];
    const fn = vi.fn().mockImplementation(async (): Promise<void> => {
      const n = fn.mock.calls.length;
      if (n === 1) throw new Error("fail 1");
      if (n === 2) throw new Error("fail 2");
    });
    await listenWithBackoff(fn, {
      _sleep: async (ms) => {
        slept.push(ms);
      },
    });
    expect(fn).toHaveBeenCalledTimes(3);
    expect(slept).toEqual([1000, 2000]);
  });

  it("onError получает attempt index и delayMs", async () => {
    const errors: Array<{ attempt: number; delayMs: number }> = [];
    const fn = vi.fn().mockImplementation(async (): Promise<void> => {
      const n = fn.mock.calls.length;
      if (n === 1) throw new Error("fail");
    });
    await listenWithBackoff(fn, {
      _sleep: async () => {},
      onError: (_err, attempt, delayMs) => {
        errors.push({ attempt, delayMs });
      },
    });
    expect(errors).toEqual([{ attempt: 0, delayMs: 1000 }]);
  });

  it("достигает cap delay 30000 после 6 ошибок подряд", async () => {
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

  it("abortSignal до старта — return сразу без вызова listenFn (line 31 true-path)", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn();
    await listenWithBackoff(fn, { abortSignal: controller.signal, _sleep: async () => {} });
    expect(fn).not.toHaveBeenCalled();
  });

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

  it("abort внутри listenFn перед resolve → return без onConnected (line 34 true-path)", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      controller.abort();
    });
    const onConnected = vi.fn();
    await listenWithBackoff(fn, {
      _sleep: async () => {},
      onConnected,
      abortSignal: controller.signal,
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onConnected).not.toHaveBeenCalled();
  });
});
