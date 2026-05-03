import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";

const USER: AppUser = { id: "00000000-0000-4000-a000-rl0000000001", tgId: 555, role: "user" };

function makeSql(count: number) {
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return vi.fn().mockResolvedValue([{ count }]) as any;
}

// Socket from trusted proxy CIDR so XFF/X-Real-IP are honored by getClientIp.
const TRUSTED_SOCKET = "172.20.0.2";

function injectSocket(c: { set: (k: never, v: unknown) => void }): void {
  c.set("socketIp" as never, TRUSTED_SOCKET);
}

function makeApp(
  mockSql: ReturnType<typeof makeSql>,
  opts?: { userLimit?: number; ipLimit?: number },
) {
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    injectSocket(c);
    await next();
  });
  app.use("/api/*", rateLimit(mockSql, opts));
  app.get("/api/ping", (c) => c.json({ ok: true }));
  return app;
}

function makeAppWithUser(
  mockSql: ReturnType<typeof makeSql>,
  user: AppUser,
  opts?: { userLimit?: number; ipLimit?: number },
) {
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    injectSocket(c);
    c.set("user" as never, user);
    await next();
  });
  app.use("/api/*", rateLimit(mockSql, opts));
  app.get("/api/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit: IP limit", () => {
  it("request under IP limit → 200", async () => {
    const sql = makeSql(1);
    const app = makeApp(sql);
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
  });

  it("sql returns empty array (no row) → treated as count=0 → 200", async () => {
    // Covers the `ipRow?.count ?? 0` branch when ipRow is undefined
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = vi.fn().mockResolvedValue([]) as any;
    const app = makeApp(sql);
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
  });

  it("request over IP limit → 429 with Retry-After", async () => {
    const sql = makeSql(1001);
    const app = makeApp(sql, { ipLimit: 1000 });
    const res = await app.request("/api/ping");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate limit exceeded");
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("uses X-Forwarded-For for IP key (first IP in list)", async () => {
    const sql = makeSql(1);
    const app = makeApp(sql);
    await app.request("/api/ping", { headers: { "X-Forwarded-For": "1.2.3.4, 5.6.7.8" } });
    const callArgs = sql.mock.calls[0];
    expect(String(callArgs?.[0])).toContain("rate_limit_buckets");
    const interpolations = callArgs?.slice(1);
    expect(interpolations?.some((v: unknown) => String(v).includes("1.2.3.4"))).toBe(true);
  });

  it("falls back to X-Real-IP when no X-Forwarded-For", async () => {
    const sql = makeSql(1);
    const app = makeApp(sql);
    await app.request("/api/ping", { headers: { "X-Real-IP": "9.8.7.6" } });
    const interpolations = sql.mock.calls[0]?.slice(1);
    expect(interpolations?.some((v: unknown) => String(v).includes("9.8.7.6"))).toBe(true);
  });

  it("falls back to socket IP when no XFF/X-Real-IP", async () => {
    const sql = makeSql(1);
    const app = makeApp(sql);
    await app.request("/api/ping");
    const interpolations = sql.mock.calls[0]?.slice(1);
    expect(interpolations?.some((v: unknown) => String(v).includes(TRUSTED_SOCKET))).toBe(true);
  });

  it("REGRESSION: socket NOT in TRUSTED_PROXIES → ignores XFF, keys by socket IP", async () => {
    const origProxy = process.env.TRUSTED_PROXIES;
    process.env.TRUSTED_PROXIES = "10.0.0.0/8";
    try {
      const sql = makeSql(1);
      const app = new Hono();
      const attackerSocket = "203.0.113.99";
      app.use("/api/*", async (c, next) => {
        c.set("socketIp" as never, attackerSocket);
        await next();
      });
      app.use("/api/*", rateLimit(sql));
      app.get("/api/ping", (c) => c.json({ ok: true }));
      await app.request("/api/ping", { headers: { "X-Forwarded-For": "1.1.1.1" } });
      const interpolations = sql.mock.calls[0]?.slice(1);
      expect(interpolations?.some((v: unknown) => String(v).includes(attackerSocket))).toBe(true);
      expect(interpolations?.some((v: unknown) => String(v).includes("1.1.1.1"))).toBe(false);
    } finally {
      process.env.TRUSTED_PROXIES = origProxy;
    }
  });
});

describe("rateLimit: user limit", () => {
  it("request under user limit → 200", async () => {
    const sql = makeSql(1);
    const app = makeAppWithUser(sql, USER, { userLimit: 100, ipLimit: 1000 });
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
    // SQL called twice: once for IP, once for user
    expect(sql.mock.calls.length).toBe(2);
  });

  it("request over user limit → 429", async () => {
    // First call (IP) returns under limit, second call (user) returns over limit
    const sql = vi
      .fn()
      // biome-ignore lint/suspicious/noExplicitAny: mock
      .mockResolvedValueOnce([{ count: 1 }] as any)
      // biome-ignore lint/suspicious/noExplicitAny: mock
      .mockResolvedValueOnce([{ count: 101 }] as any);
    const app = makeAppWithUser(sql as ReturnType<typeof makeSql>, USER, { userLimit: 100 });
    const res = await app.request("/api/ping");
    expect(res.status).toBe(429);
  });

  it("no user in context → only IP check", async () => {
    const sql = makeSql(1);
    const app = makeApp(sql, { ipLimit: 1000 }); // no user set
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
    // SQL called only once (IP only, no user)
    expect(sql.mock.calls.length).toBe(1);
  });

  it("user rate-limit SQL returns empty row → count=0, under limit → 200", async () => {
    // Covers `userRow?.count ?? 0` when userRow is undefined (empty array)
    const sql = vi
      .fn()
      // biome-ignore lint/suspicious/noExplicitAny: mock
      .mockResolvedValueOnce([{ count: 1 }] as any) // IP query → ok
      // biome-ignore lint/suspicious/noExplicitAny: mock
      .mockResolvedValueOnce([] as any); // user query → empty, count defaults to 0
    const app = makeAppWithUser(sql as ReturnType<typeof makeSql>, USER, { userLimit: 100 });
    const res = await app.request("/api/ping");
    expect(res.status).toBe(200);
  });
});
