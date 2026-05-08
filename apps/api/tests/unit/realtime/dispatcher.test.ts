/**
 * Unit tests for the SSE dispatcher (apps/api/src/realtime/dispatcher.ts).
 * Mocks postgres.Sql.listen — no DB needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { poolMetrics } from "../../../src/db/pool";

// We must mock pool metrics to track inc/dec calls in isolation
vi.mock("../../../src/db/pool", () => ({
  poolMetrics: {
    incSseSubscribers: vi.fn(),
    decSseSubscribers: vi.fn(),
    snapshot: vi.fn().mockReturnValue({ max: 20, in_use: 0, waiting: 0, sse_subscribers: 0 }),
  },
}));

import { createDispatcher } from "../../../src/realtime/dispatcher";

type NotifyFn = (payload: string) => void;

function makeMockSql() {
  let notifyFn: NotifyFn | null = null;

  const sql = {
    listen: vi.fn().mockImplementation((_ch: string, cb: NotifyFn) => {
      notifyFn = cb;
      return Promise.resolve({ unlisten: vi.fn() });
    }),
  };

  return {
    sql: sql as unknown as import("postgres").Sql,
    triggerNotify: (payload: string) => notifyFn?.(payload),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDispatcher", () => {
  it("вызывает sql.listen с правильным каналом при инициализации", async () => {
    const { sql } = makeMockSql();
    await createDispatcher(sql, "rides_changed");
    expect(sql.listen).toHaveBeenCalledOnce();
    expect(sql.listen).toHaveBeenCalledWith("rides_changed", expect.any(Function));
  });

  it("subscribe возвращает функцию unsubscribe", async () => {
    const { sql } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");
    const unsub = dispatcher.subscribe(vi.fn());
    expect(typeof unsub).toBe("function");
  });

  it("subscriberCount растёт при subscribe и падает при unsubscribe", async () => {
    const { sql } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    expect(dispatcher.subscriberCount()).toBe(0);

    const unsub1 = dispatcher.subscribe(vi.fn());
    const unsub2 = dispatcher.subscribe(vi.fn());
    expect(dispatcher.subscriberCount()).toBe(2);

    unsub1();
    expect(dispatcher.subscriberCount()).toBe(1);

    unsub2();
    expect(dispatcher.subscriberCount()).toBe(0);
  });

  it("fan-out: все подписчики получают payload", async () => {
    const { sql, triggerNotify } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const received: string[][] = [[], [], []];
    const unsubs = received.map((arr) =>
      dispatcher.subscribe((p) => {
        arr.push(p);
      }),
    );

    triggerNotify?.('{"ride_id":"abc"}');

    for (const arr of received) {
      expect(arr).toEqual(['{"ride_id":"abc"}']);
    }

    for (const unsub of unsubs) unsub();
  });

  it("unsubscribed callback не получает новые события", async () => {
    const { sql, triggerNotify } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const received: string[] = [];
    const unsub = dispatcher.subscribe((p) => received.push(p));

    triggerNotify?.("first");
    unsub();
    triggerNotify?.("second");

    expect(received).toEqual(["first"]);
  });

  it("poolMetrics.incSseSubscribers вызывается при subscribe", async () => {
    const { sql } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const unsub = dispatcher.subscribe(vi.fn());
    expect(poolMetrics.incSseSubscribers).toHaveBeenCalledOnce();
    unsub();
  });

  it("poolMetrics.decSseSubscribers вызывается при unsubscribe", async () => {
    const { sql } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const unsub = dispatcher.subscribe(vi.fn());
    unsub();
    expect(poolMetrics.decSseSubscribers).toHaveBeenCalledOnce();
  });

  it("50 одновременных подписчиков — каждый получает ровно одно событие", async () => {
    const { sql, triggerNotify } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const N = 50;
    const received: string[][] = Array.from({ length: N }, () => []);
    const unsubs = received.map((arr) =>
      dispatcher.subscribe((p) => {
        arr.push(p);
      }),
    );

    expect(dispatcher.subscriberCount()).toBe(N);
    triggerNotify?.('{"ride_id":"test-50"}');

    for (let i = 0; i < N; i++) {
      expect(received[i]).toHaveLength(1);
      expect(received[i]?.[0]).toBe('{"ride_id":"test-50"}');
    }

    for (const unsub of unsubs) unsub();
    expect(dispatcher.subscriberCount()).toBe(0);
  });

  it("повторный unsubscribe не вызывает ошибку", async () => {
    const { sql } = makeMockSql();
    const dispatcher = await createDispatcher(sql, "rides_changed");

    const unsub = dispatcher.subscribe(vi.fn());
    unsub();
    expect(() => unsub()).not.toThrow();
  });

  it("sql.listen retries: dispatcher инициализируется после нескольких ошибок", async () => {
    let attempt = 0;
    const sqlRetry = {
      listen: vi.fn().mockImplementation((_ch: string, _cb: NotifyFn) => {
        attempt++;
        if (attempt < 3) return Promise.reject(new Error("retry"));
        return Promise.resolve({ unlisten: vi.fn() });
      }),
    } as unknown as import("postgres").Sql;

    // listenWithBackoff retries without sleep in test (mock resolves/rejects synchronously)
    const dispatcher = await createDispatcher(sqlRetry, "rides_changed");
    expect(attempt).toBeGreaterThanOrEqual(3);
    expect(dispatcher.subscriberCount()).toBe(0);
  });

  it("persistent reconnect: callback-множество живёт независимо от listen-вызова; повторные notify приходят", async () => {
    // Проверяем что Set<callbacks> остаётся живым и после reconnect (повторный вызов listen
    // через postgres-js onclose регистрирует ту же fn → новые notify доходят подписчикам).
    let currentNotifyFn: NotifyFn | null = null;
    let listenCallCount = 0;
    // listenMock захватывает fn и позволяет нам вызвать её напрямую как postgres-js
    const listenMock = vi.fn().mockImplementation((_ch: string, cb: NotifyFn) => {
      listenCallCount++;
      currentNotifyFn = cb;
      return Promise.resolve({ unlisten: vi.fn() });
    });

    const sqlPersist = { listen: listenMock } as unknown as import("postgres").Sql;
    const dispatcher = await createDispatcher(sqlPersist, "rides_changed");
    const received: string[] = [];
    dispatcher.subscribe((p) => received.push(p));

    // Первый notify — listener активен
    expect(currentNotifyFn).not.toBeNull();
    // biome-ignore lint/style/noNonNullAssertion: проверено выше через expect
    const notifyFirst = currentNotifyFn!;
    notifyFirst("msg1");
    expect(received).toEqual(["msg1"]);

    // Симулируем reconnect через postgres-js onclose: тот же fn передаётся снова в listen.
    // biome-ignore lint/style/noNonNullAssertion: проверено выше
    await listenMock("rides_changed", currentNotifyFn!);
    // biome-ignore lint/style/noNonNullAssertion: обновляется listenMock
    currentNotifyFn!("msg2");
    expect(received).toEqual(["msg1", "msg2"]);
    expect(listenCallCount).toBeGreaterThanOrEqual(2);
  });
});
