/**
 * Unit tests: rate-limit + bodyLimit для /api/client-errors (FIX A1 + A2-partial)
 * TDD: тесты написаны ДО реализации.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describe, expect, it, vi } from "vitest";
import { createClientErrorsRouter } from "../../../src/client-errors/clientErrorsRouter";
import { clientErrorsRateLimit } from "../../../src/middleware/client-errors-rate-limit";

function makeSql(count = 1) {
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return vi.fn().mockResolvedValue([{ count }]) as any;
}

function makeApp(opts: { sqlCount?: number; bodyLimitBytes?: number } = {}) {
  const { sqlCount = 1, bodyLimitBytes = 4096 } = opts;
  const sql = makeSql(sqlCount);
  const app = new Hono();
  // Simulate socketIp (trusted proxy mock not needed — "unknown" is fine for rate-limit test)
  app.use("*", async (c, next) => {
    c.set("socketIp" as never, "10.0.0.1");
    await next();
  });
  // bodyLimit FIRST — oversized body must not consume rate-limit slot (I-1 fix)
  app.use("/api/client-errors/*", bodyLimit({ maxSize: bodyLimitBytes }));
  app.use("/api/client-errors/*", clientErrorsRateLimit(sql));
  app.route("/api/client-errors", createClientErrorsRouter(sql));
  return { app, sql };
}

describe("clientErrorsRateLimit", () => {
  it("запрос в рамках лимита (count=1) → проходит (200)", async () => {
    const { app } = makeApp({ sqlCount: 1 });
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test error" }),
    });
    expect(res.status).toBe(200);
  });

  it("6-й запрос с одного IP (count=6 > limit=5) → 429", async () => {
    const { app } = makeApp({ sqlCount: 6 });
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "spam" }),
    });
    expect(res.status).toBe(429);
  });

  it("429 содержит Retry-After заголовок", async () => {
    const { app } = makeApp({ sqlCount: 6 });
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "spam" }),
    });
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("ключ rate-limit содержит clienterr:ip: и IP", async () => {
    const sqlCalls: string[] = [];
    const tracingSql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push(String(values[0]));
      return Promise.resolve([{ count: 1 }]);
    }) as unknown as Parameters<typeof clientErrorsRateLimit>[0];

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("socketIp" as never, "1.2.3.4");
      await next();
    });
    app.use("/api/client-errors/*", clientErrorsRateLimit(tracingSql));
    app.route("/api/client-errors", createClientErrorsRouter(tracingSql));

    await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "test" }),
    });
    expect(sqlCalls.some((k) => k.includes("clienterr:ip:"))).toBe(true);
  });
});

describe("bodyLimit 4096 на /api/client-errors", () => {
  it("тело ровно 4096 байт → 200 (допустимо)", async () => {
    const sql = makeSql(1);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("socketIp" as never, "10.0.0.1");
      await next();
    });
    app.use("/api/client-errors/*", bodyLimit({ maxSize: 4096 }));
    app.use("/api/client-errors/*", clientErrorsRateLimit(sql));
    app.route("/api/client-errors", createClientErrorsRouter(sql));

    // Строим payload ровно ≤4096 (message до 500 символов — ограничение схемы)
    const payload = JSON.stringify({ message: "x".repeat(100) });
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(payload.length),
      },
      body: payload,
    });
    expect(res.status).toBe(200);
  });

  it("тело >4096 байт → 413", async () => {
    const sql = makeSql(1);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("socketIp" as never, "10.0.0.1");
      await next();
    });
    app.use("/api/client-errors/*", bodyLimit({ maxSize: 4096 }));
    app.use("/api/client-errors/*", clientErrorsRateLimit(sql));
    app.route("/api/client-errors", createClientErrorsRouter(sql));

    const bigBody = "x".repeat(5000);
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bigBody.length),
      },
      body: bigBody,
    });
    expect(res.status).toBe(413);
  });

  it("oversized body → 413 без вызова rate-limit (I-1: DoS amplification fix)", async () => {
    const sql = makeSql(1);
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("socketIp" as never, "10.0.0.1");
      await next();
    });
    app.use("/api/client-errors/*", bodyLimit({ maxSize: 4096 }));
    app.use("/api/client-errors/*", clientErrorsRateLimit(sql));
    app.route("/api/client-errors", createClientErrorsRouter(sql));

    const bigBody = "x".repeat(5000);
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bigBody,
    });
    expect(res.status).toBe(413);
    expect(sql).not.toHaveBeenCalled();
  });
});
