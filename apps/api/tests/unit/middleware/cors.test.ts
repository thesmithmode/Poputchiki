import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { corsMiddleware } from "../../../src/middleware/cors";

const DOMAIN = "test.example";
const ALLOWED_ORIGIN = `https://app.${DOMAIN}`;

function makeApp(): Hono {
  const app = new Hono();
  app.use("*", corsMiddleware);
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("CORS middleware", () => {
  const origDomain = process.env.DOMAIN;

  beforeEach(() => {
    process.env.DOMAIN = DOMAIN;
  });

  afterEach(() => {
    process.env.DOMAIN = origDomain;
  });

  it("OPTIONS preflight with allowed origin → 204 + CORS headers", async () => {
    const res = await makeApp().request("/test", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-headers")).toContain("Content-Type");
  });

  it("OPTIONS preflight with disallowed origin → no Allow-Origin header", async () => {
    const res = await makeApp().request("/test", {
      method: "OPTIONS",
      headers: { origin: "https://evil.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("GET with allowed origin → CORS headers present", async () => {
    const res = await makeApp().request("/test", {
      method: "GET",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("GET with disallowed origin → no Allow-Origin header", async () => {
    const res = await makeApp().request("/test", {
      method: "GET",
      headers: { origin: "https://evil.com" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("request without Origin header → no Allow-Origin header", async () => {
    const res = await makeApp().request("/test", { method: "GET" });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("wildcard origin rejected — never returns *", async () => {
    const res = await makeApp().request("/test", {
      method: "GET",
      headers: { origin: "*" },
    });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("production: missing DOMAIN returns 500 (fail-fast)", async () => {
    const savedDomain = process.env.DOMAIN;
    const savedNodeEnv = process.env.NODE_ENV;
    // biome-ignore lint/performance/noDelete: env vars нужно фактически удалить чтобы fail-fast guard сработал; присваивание undefined оставит ключ в process.env
    delete process.env.DOMAIN;
    process.env.NODE_ENV = "production";
    try {
      const res = await makeApp().request("/test", {
        method: "GET",
        headers: { origin: "https://app.somehost.com" },
      });
      expect(res.status).toBe(500);
    } finally {
      // biome-ignore lint/performance/noDelete: восстановление test-env state требует фактического удаления ключа
      if (savedDomain === undefined) delete process.env.DOMAIN;
      else process.env.DOMAIN = savedDomain;
      // biome-ignore lint/performance/noDelete: восстановление test-env state требует фактического удаления ключа
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
    }
  });
});
