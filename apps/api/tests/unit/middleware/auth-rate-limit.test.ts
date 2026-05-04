/**
 * Unit tests: /auth/* IP-based rate limit (10 req/min).
 */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { authRateLimit } from "../../../src/middleware/auth-rate-limit";
import { readJson } from "../../helpers/json";

describe("authRateLimit middleware", () => {
  it("запрос в рамках лимита → проходит", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const sql = vi.fn().mockResolvedValue([{ count: 1 }]) as any;
    const app = new Hono();
    app.use("/auth/*", async (c, next) => {
      c.set("socketIp" as never, "172.20.0.2");
      await next();
    });
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.post("/auth/telegram", (c) => c.json({ ok: true }, 200));

    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "X-Forwarded-For": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  it("count > ipLimit → 429 с Retry-After", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const sql = vi.fn().mockResolvedValue([{ count: 11 }]) as any;
    const app = new Hono();
    app.use("/auth/*", async (c, next) => {
      c.set("socketIp" as never, "172.20.0.2");
      await next();
    });
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.post("/auth/telegram", (c) => c.json({ ok: true }, 200));

    const res = await app.request("/auth/telegram", {
      method: "POST",
      headers: { "X-Forwarded-For": "5.6.7.8" },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await readJson(res);
    expect(body.error).toContain("rate limit");
  });

  it("при rate limit sql вызывается с ip ключом", async () => {
    const sqlCalls: string[] = [];
    const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push(String(values[0]));
      return Promise.resolve([{ count: 1 }]);
    }) as unknown as Parameters<typeof authRateLimit>[0];

    const app = new Hono();
    app.use("/auth/*", async (c, next) => {
      c.set("socketIp" as never, "172.20.0.2");
      await next();
    });
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.post("/auth/telegram", (c) => c.json({ ok: true }));

    await app.request("/auth/telegram", {
      method: "POST",
      headers: { "X-Forwarded-For": "9.8.7.6" },
    });

    expect(sqlCalls.some((k) => k.includes("ip:") || k.includes("9.8.7.6"))).toBe(true);
  });

  it("без opts → дефолт ipLimit=10", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn().mockResolvedValue([{ count: 11 }]) as any;
    const app = new Hono();
    app.use("/auth/*", async (c, next) => {
      c.set("socketIp" as never, "172.20.0.2");
      await next();
    });
    app.use("/auth/*", authRateLimit(sql));
    app.post("/auth/telegram", (c) => c.json({ ok: true }, 200));
    const res = await app.request("/auth/telegram", { method: "POST" });
    expect(res.status).toBe(429);
  });

  it("ipRow undefined → проходит (count=0)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn().mockResolvedValue([]) as any;
    const app = new Hono();
    app.use("/auth/*", async (c, next) => {
      c.set("socketIp" as never, "172.20.0.2");
      await next();
    });
    app.use("/auth/*", authRateLimit(sql));
    app.post("/auth/telegram", (c) => c.json({ ok: true }, 200));
    const res = await app.request("/auth/telegram", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("на /api/* middleware НЕ применяется", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const sql = vi.fn().mockResolvedValue([{ count: 999 }]) as any;
    const app = new Hono();
    app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
    app.get("/api/rides", (c) => c.json({ rides: [] }));

    const res = await app.request("/api/rides");
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });
});
