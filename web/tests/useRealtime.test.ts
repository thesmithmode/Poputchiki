import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtime } from "../src/hooks/useRealtime";

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  onerror: ((e: Event) => void) | null = null;
  private listeners: Record<string, ((e: Event) => void)[]> = {};

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: Event) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  emit(type: string, data?: string) {
    const event = data !== undefined ? new MessageEvent(type, { data }) : new Event(type);
    for (const cb of this.listeners[type] ?? []) cb(event);
  }

  close() {}
}

describe("useRealtime", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    client.clear();
  });

  it("создаёт EventSource на /api/realtime/rides с credentials", () => {
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es?.url).toBe("/api/realtime/rides");
    expect(es?.withCredentials).toBe(true);
  });

  it("инвалидирует кэш rides и ride при событии ride_changed", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    await act(async () => {
      MockEventSource.instances[0]?.emit("ride_changed", '{"ride_id":"123"}');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rides"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ride"] });
  });

  it("при ошибке SSE запускает fallback polling через 30s", async () => {
    vi.useFakeTimers();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    await act(async () => {
      MockEventSource.instances[0]?.onerror?.(new Event("error"));
    });

    // Advance 30s — fallback должен сработать
    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rides"] });
  });

  it("при ошибке SSE повторяет через 1s (первый backoff)", async () => {
    vi.useFakeTimers();
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    const firstInstance = MockEventSource.instances[0];
    await act(async () => {
      firstInstance?.onerror?.(new Event("error"));
    });

    expect(MockEventSource.instances).toHaveLength(1); // пока ещё не reconnected

    // Через 1s должен появиться новый EventSource
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("5 ошибок подряд → cap 60s", async () => {
    vi.useFakeTimers();
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    // Шаги: 1s, 2s, 5s, 15s, 30s, 60s cap
    // attempt 0→1s, 1→2s, 2→5s, 3→15s, 4→30s, 5→60s
    const steps = [1_000, 2_000, 5_000, 15_000, 30_000];
    for (const delay of steps) {
      const last = MockEventSource.instances[MockEventSource.instances.length - 1];
      if (!last) throw new Error("Expected MockEventSource instance");
      await act(async () => {
        last.onerror?.(new Event("error"));
      });
      await act(async () => {
        vi.advanceTimersByTime(delay);
      });
    }

    // 6-й attempt — задержка должна быть 60s (cap)
    const last5 = MockEventSource.instances[MockEventSource.instances.length - 1];
    if (!last5) throw new Error("Expected MockEventSource instance");
    await act(async () => {
      last5.onerror?.(new Event("error"));
    });

    const countBefore = MockEventSource.instances.length;
    // Через 59s — ещё нет reconnect
    await act(async () => {
      vi.advanceTimersByTime(59_000);
    });
    expect(MockEventSource.instances).toHaveLength(countBefore);

    // Через ещё 1s (итого 60s) — reconnect
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });
    expect(MockEventSource.instances).toHaveLength(countBefore + 1);
  });

  it("online event → мгновенный reconnect, сброс backoff", async () => {
    vi.useFakeTimers();

    // Перехватываем window.addEventListener чтобы контролировать вызов
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    // Найти зарегистрированный handler для "online"
    const onlineCall = addListenerSpy.mock.calls.find(([type]) => type === "online");
    const onlineHandler = onlineCall?.[1] as ((e: Event) => void) | undefined;
    addListenerSpy.mockRestore();

    // Вызвать ошибку — запустить backoff (следующий retry через 1s)
    await act(async () => {
      MockEventSource.instances[0]?.onerror?.(new Event("error"));
    });

    const countAfterError = MockEventSource.instances.length;

    // Вызвать online handler напрямую, без window.dispatchEvent
    await act(async () => {
      onlineHandler?.(new Event("online"));
    });

    // Должен создаться новый EventSource сразу
    expect(MockEventSource.instances.length).toBeGreaterThan(countAfterError);
  });

  it("cleanup при unmount убирает listeners и timers", async () => {
    vi.useFakeTimers();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    // Вызвать ошибку
    await act(async () => {
      MockEventSource.instances[0]?.onerror?.(new Event("error"));
    });

    unmount();

    // После unmount таймеры не должны вызывать invalidate
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(invalidate).not.toHaveBeenCalled();

    // removeEventListener("online", ...) должен быть вызван при cleanup
    expect(removeListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    removeListenerSpy.mockRestore();
  });

  it("при отсутствии EventSource сразу запускает fallback polling", async () => {
    vi.unstubAllGlobals();
    // EventSource не определён
    vi.useFakeTimers();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rides"] });
  });

  it("open event сбрасывает backoff и останавливает fallback", async () => {
    vi.useFakeTimers();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    // Ошибка → fallback запущен
    await act(async () => {
      MockEventSource.instances[0]?.onerror?.(new Event("error"));
    });

    // Retry через 1s
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    const newEs = MockEventSource.instances[MockEventSource.instances.length - 1];
    if (!newEs) throw new Error("Expected MockEventSource instance");
    // open → fallback должен остановиться
    await act(async () => {
      newEs.emit("open");
    });

    invalidate.mockClear();

    // Далее 60s — fallback не должен срабатывать
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
