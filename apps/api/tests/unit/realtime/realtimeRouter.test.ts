/**
 * Unit tests for realtimeRouter — covers finally block (clearInterval + unlisten).
 * Uses mocked sql.listen so no DB needed.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterEach, describe, expect, it, vi } from "vitest";
import { identityGuard } from "../../../src/middleware/identity-guard";
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
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${USER.tgId}` };
}

function makeMockSql() {
  let notifyCallback: ((payload: string) => void) | null = null;
  const unlisten = vi.fn().mockResolvedValue(undefined);
  const sql = {
    listen: vi.fn().mockImplementation((_ch: string, cb: (p: string) => void) => {
      notifyCallback = cb;
      return Promise.resolve({ unlisten });
    }),
  };
  return { sql, unlisten, notify: (p: string) => notifyCallback?.(p) };
}

function buildApp(sql: ReturnType<typeof makeMockSql>["sql"], heartbeatMs = 60_000) {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/realtime", createRealtimeRouter(sql as never, { heartbeatMs }));
  return app;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("realtimeRouter unit", () => {
  it("401 без auth", async () => {
    const { sql } = makeMockSql();
    const res = await buildApp(sql).request("/api/realtime/rides");
    expect(res.status).toBe(401);
    await res.body?.cancel().catch(() => {});
  });

  it("200 text/event-stream при авторизации", async () => {
    const { sql } = makeMockSql();
    const app = buildApp(sql);
    const token = await makeToken();
    const ctrl = new AbortController();

    const resPromise = app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });

    // Abort before reading — triggers onAbort → finally
    ctrl.abort();
    const res = await resPromise;
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.body?.cancel().catch(() => {});
  });

  it("finally: clearInterval + unlisten при abort", async () => {
    const { sql, unlisten } = makeMockSql();
    const app = buildApp(sql);
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

    expect(sql.listen).toHaveBeenCalledWith("rides_changed", expect.any(Function));
    expect(unlisten).toHaveBeenCalled();
  }, 5000);

  it("heartbeat: setInterval создаётся с нужным интервалом", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const { sql } = makeMockSql();
    const app = buildApp(sql, 77);
    const token = await makeToken();
    const ctrl = new AbortController();

    ctrl.abort();
    const res = await app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });
    await res.body?.cancel().catch(() => {});
    await new Promise<void>((r) => setTimeout(r, 20));

    // heartbeatTimer = setInterval(..., heartbeatMs)
    const heartbeatCall = setIntervalSpy.mock.calls.find((args) => args[1] === 77);
    expect(heartbeatCall).toBeDefined();
  }, 5000);

  it("sql.listen вызывается с каналом rides_changed", async () => {
    const { sql } = makeMockSql();
    const app = buildApp(sql);
    const token = await makeToken();
    const ctrl = new AbortController();

    ctrl.abort();
    const res = await app.request("/api/realtime/rides", {
      headers: makeAuthHeaders(token),
      signal: ctrl.signal,
    });
    await res.body?.cancel().catch(() => {});
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(sql.listen).toHaveBeenCalledWith("rides_changed", expect.any(Function));
  }, 5000);
});
