import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setupErrorCapture } from "../../../src/middleware/error-capture";

function makeSql() {
  const mock = vi.fn().mockResolvedValue([]);
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return mock as any;
}

function makeApp(sql = makeSql(), opts?: Parameters<typeof setupErrorCapture>[2]) {
  const app = new Hono();
  setupErrorCapture(app, sql, opts);
  app.get("/ok", (c) => c.json({ ok: true }));
  app.get("/fail", () => {
    throw new Error("boom");
  });
  return { app, sql };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setupErrorCapture / onError handler", () => {
  it("пропускает успешный ответ без записи в error_log", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/ok");
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("перехватывает исключение → 500 + записывает в error_log", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/fail");
    expect(res.status).toBe(500);
    expect(sql).toHaveBeenCalledTimes(1);
    const call = sql.mock.calls[0];
    expect(JSON.stringify(call)).toContain("error_log");
  });

  it("PII-поля не попадают в error message payload", async () => {
    const sql = makeSql();
    const app = new Hono();
    setupErrorCapture(app, sql, { sampleRate: 1 });
    app.get("/pii", () => {
      throw new Error("Failed: token=abc123secret, Bearer xyz789token");
    });

    await app.request("/pii");

    expect(sql).toHaveBeenCalledTimes(1);
    const callStr = JSON.stringify(sql.mock.calls[0]);
    expect(callStr).not.toContain("abc123secret");
    expect(callStr).not.toContain("xyz789token");
  });

  it("sample rate 0 → не записывает ничего", async () => {
    const { app, sql } = makeApp(makeSql(), { sampleRate: 0 });
    await app.request("/fail");
    expect(sql).not.toHaveBeenCalled();
  });

  it("sample rate 1 → всегда записывает", async () => {
    const { app, sql } = makeApp(makeSql(), { sampleRate: 1 });
    await app.request("/fail");
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("возвращает JSON ответ с error полем", async () => {
    const { app } = makeApp();
    const res = await app.request("/fail");
    expect(res.status).toBe(500);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("internal server error");
  });
});
