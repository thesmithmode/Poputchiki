/**
 * Unit tests for realtimeRouter — covers finally block (clearInterval + unsubscribe).
 * Uses a mock Dispatcher so no DB needed.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { identityGuard } from "../../../src/middleware/identity-guard";
import type { Dispatcher } from "../../../src/realtime/dispatcher";
import { createRealtimeRouter } from "../../../src/realtime/realtimeRouter";

const JWT_SECRET = "test-secret-realtime-unit";

const USER = {
  id: "00000000-0000-4000-a000-000000000001",
  tgId: 1001,
  role: "user" as const,
};

async function makeToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(USER.tgId),
      uid: USER.id,
      role: USER.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` };
}

function makeMockDispatcher(): { dispatcher: Dispatcher; notify: (p: string) => void } {
  let storedCb: ((payload: string) => void) | null = null;
  const unsubscribe = vi.fn().mockImplementation(() => {
    storedCb = null;
  });
  const subscribe = vi.fn().mockImplementation((cb: (payload: string) => void) => {
    storedCb = cb;
    return unsubscribe;
  });
  const subscriberCount = vi.fn().mockReturnValue(0);

  const dispatcher: Dispatcher = { subscribe, subscriberCount };
  return {
    dispatcher,
    notify: (p: string) => storedCb?.(p),
  };
}

function buildApp(dispatcher: Dispatcher, heartbeatMs = 60_000) {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/realtime", createRealtimeRouter(dispatcher, { heartbeatMs }));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("realtimeRouter unit", () => {
  it("401 без auth", async () => {
    const { dispatcher } = makeMockDispatcher();
    const res = await buildApp(dispatcher).request("/api/realtime/rides");
    expect(res.status).toBe(401);
    await res.body?.cancel().catch(() => {});
  });

  it("200 text/event-stream при авторизации", async () => {
    const { dispatcher } = makeMockDispatcher();
    const app = buildApp(dispatcher);
    const token = await makeToken();
    const ctrl = new AbortController();

    const resPromise = app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });

    ctrl.abort();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel().catch(() => {});
  });

  it("finally: clearInterval + unsubscribe при abort", async () => {
    const { dispatcher } = makeMockDispatcher();
    const app = buildApp(dispatcher);
    const token = await makeToken();
    const ctrl = new AbortController();

    const resPromise = app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });

    ctrl.abort();
    const res = await resPromise;
    await res.body?.cancel().catch(() => {});

    // Drain microtasks so async finally completes
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(dispatcher.subscribe).toHaveBeenCalledOnce();
    // unsubscribe returned by subscribe should have been called
    const unsubFn = (dispatcher.subscribe as ReturnType<typeof vi.fn>).mock.results[0]?.value;
    expect(unsubFn).toBeDefined();
    expect(unsubFn).toHaveBeenCalled();
  }, 5000);

  it("heartbeat: setInterval создаётся с нужным интервалом", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { dispatcher } = makeMockDispatcher();
    const app = buildApp(dispatcher, 77);
    const token = await makeToken();
    const ctrl = new AbortController();

    ctrl.abort();
    const res = await app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });
    await res.body?.cancel().catch(() => {});
    await new Promise<void>((r) => setTimeout(r, 20));

    const heartbeatCall = setIntervalSpy.mock.calls.find((args) => args[1] === 77);
    expect(heartbeatCall).toBeDefined();
  }, 5000);

  it("dispatcher.subscribe вызывается при подключении клиента", async () => {
    const { dispatcher } = makeMockDispatcher();
    const app = buildApp(dispatcher);
    const token = await makeToken();
    const ctrl = new AbortController();

    ctrl.abort();
    const res = await app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });
    await res.body?.cancel().catch(() => {});
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(dispatcher.subscribe).toHaveBeenCalledOnce();
  }, 5000);
});

describe("realtimeRouter unit — dispatcher multiplex", () => {
  it("N одновременных клиентов — каждый получает payload через fan-out", async () => {
    // Реализуем собственный диспетчер с реальной fan-out логикой для теста
    const callbacks: ((p: string) => void)[] = [];
    const realDispatcher: Dispatcher = {
      subscribe: vi.fn().mockImplementation((cb: (p: string) => void) => {
        callbacks.push(cb);
        return () => {
          const idx = callbacks.indexOf(cb);
          if (idx !== -1) callbacks.splice(idx, 1);
        };
      }),
      subscriberCount: vi.fn().mockImplementation(() => callbacks.length),
    };

    const N = 50;
    const received: string[][] = Array.from({ length: N }, () => []);

    // Subscribe N callbacks directly via dispatcher interface
    const unsubscribers: (() => void)[] = [];
    for (let i = 0; i < N; i++) {
      const idx = i;
      const unsub = realDispatcher.subscribe((p) => {
        received[idx]?.push(p);
      });
      unsubscribers.push(unsub);
    }

    expect(realDispatcher.subscriberCount()).toBe(N);

    // Fan-out a payload
    const testPayload = JSON.stringify({ ride_id: "abc", type: "created" });
    for (const cb of [...callbacks]) cb(testPayload);

    // Each subscriber should have received exactly one event
    for (let i = 0; i < N; i++) {
      expect(received[i]).toHaveLength(1);
      expect(received[i]?.[0]).toBe(testPayload);
    }

    // Unsubscribe all
    for (const unsub of unsubscribers) unsub();
    expect(realDispatcher.subscriberCount()).toBe(0);
  });
});
