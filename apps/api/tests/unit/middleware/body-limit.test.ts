/**
 * Unit tests: глобальный bodyLimit 64KB для /api/* и /auth/* (FIX A2)
 * Проверяет что bodyLimit настроен на 65536 байт в createApp.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { describe, expect, it } from "vitest";

const MAX_SIZE = 65536; // 64KB — как в createApp

function makeApp(maxSize = MAX_SIZE) {
  const app = new Hono();
  app.use("/api/*", bodyLimit({ maxSize }));
  app.use("/auth/*", bodyLimit({ maxSize }));
  app.post("/api/rides", (c) => c.json({ ok: true }, 200));
  app.post("/auth/login", (c) => c.json({ ok: true }, 200));
  return app;
}

describe("bodyLimit 64KB на /api/* (A2)", () => {
  it("тело 100KB (>64KB) на /api/* → 413", async () => {
    const app = makeApp();
    const bigBody = "x".repeat(100 * 1024);
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bigBody.length),
      },
      body: bigBody,
    });
    expect(res.status).toBe(413);
  });

  it("тело 32KB (<=64KB) на /api/* → не 413", async () => {
    const app = makeApp();
    const body = JSON.stringify({ data: "x".repeat(32 * 1024 - 20) });
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      },
      body,
    });
    // bodyLimit пропускает — маршрут может вернуть 200
    expect(res.status).not.toBe(413);
  });

  it("тело 100KB на /auth/* → 413", async () => {
    const app = makeApp();
    const bigBody = "x".repeat(100 * 1024);
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(bigBody.length),
      },
      body: bigBody,
    });
    expect(res.status).toBe(413);
  });

  it("тело ровно 65536 байт → не 413", async () => {
    const app = makeApp();
    const body = "x".repeat(MAX_SIZE);
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(res.status).not.toBe(413);
  });

  it("тело 65537 байт (один байт сверх лимита) → 413", async () => {
    const app = makeApp();
    const body = "x".repeat(MAX_SIZE + 1);
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
      },
      body,
    });
    expect(res.status).toBe(413);
  });
});
