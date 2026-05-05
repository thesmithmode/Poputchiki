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
  private listeners: Record<string, ((e: MessageEvent) => void)[]> = {};

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(cb);
  }

  emit(type: string, data: string) {
    const event = new MessageEvent(type, { data });
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
    client.clear();
  });

  it("создаёт EventSource на /api/realtime/rides с credentials", () => {
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });
    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();
    expect(es?.url).toBe("/api/realtime/rides");
    expect(es?.withCredentials).toBe(true);
  });

  it("инвалидирует кэш rides при событии ride_changed", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useRealtime(), { wrapper: makeWrapper(client) });

    await act(async () => {
      MockEventSource.instances[0]?.emit("ride_changed", '{"ride_id":"123"}');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["rides"] });
  });

  it("переключается на fallback polling при ошибке SSE", async () => {
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
    vi.useRealTimers();
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
    vi.useRealTimers();
  });
});
