/**
 * Sentinel: untrusted clients cannot bypass IP-based rate-limit by spoofing
 * X-Forwarded-For. Was a real bug — see review of branch
 * `claude/review-dev-progress-nENjp`.
 */
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { authRateLimit } from "../../src/middleware/auth-rate-limit";
import { rateLimit } from "../../src/middleware/rate-limit";

describe("XFF anti-spoof sentinel", () => {
  it("auth-rate-limit: socket NOT in TRUSTED_PROXIES → IP key is socket, NOT XFF", async () => {
    const origProxy = process.env.TRUSTED_PROXIES;
    process.env.TRUSTED_PROXIES = "127.0.0.1/32";
    try {
      const sqlCalls: unknown[][] = [];
      const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
        sqlCalls.push(values);
        return Promise.resolve([{ count: 1 }]);
      }) as unknown as Parameters<typeof authRateLimit>[0];

      const attackerSocket = "203.0.113.99";
      const app = new Hono();
      app.use("/auth/*", async (c, next) => {
        c.set("socketIp" as never, attackerSocket);
        await next();
      });
      app.use("/auth/*", authRateLimit(sql, { ipLimit: 10 }));
      app.post("/auth/telegram", (c) => c.json({ ok: true }));

      // Attacker rotates XFF every request, hoping each becomes a fresh bucket
      for (const fakeIp of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
        await app.request("/auth/telegram", {
          method: "POST",
          headers: { "X-Forwarded-For": fakeIp },
        });
      }

      // Every recorded SQL call must reference the real socket IP, never the spoofed XFFs.
      const flat = sqlCalls.flat().map(String).join("|");
      expect(flat).toContain(attackerSocket);
      expect(flat).not.toContain("1.1.1.1");
      expect(flat).not.toContain("2.2.2.2");
      expect(flat).not.toContain("3.3.3.3");
    } finally {
      process.env.TRUSTED_PROXIES = origProxy;
    }
  });

  it("api rate-limit: socket NOT in TRUSTED_PROXIES → IP key is socket, NOT XFF", async () => {
    const origProxy = process.env.TRUSTED_PROXIES;
    process.env.TRUSTED_PROXIES = "127.0.0.1/32";
    try {
      // biome-ignore lint/suspicious/noExplicitAny: mock
      const sql = vi.fn().mockResolvedValue([{ count: 1 }]) as any;
      const attackerSocket = "198.51.100.10";
      const app = new Hono();
      app.use("/api/*", async (c, next) => {
        c.set("socketIp" as never, attackerSocket);
        await next();
      });
      app.use("/api/*", rateLimit(sql));
      app.get("/api/x", (c) => c.json({ ok: true }));

      await app.request("/api/x", { headers: { "X-Forwarded-For": "9.9.9.9" } });

      const allArgs = sql.mock.calls.flatMap((c: unknown[]) => c.slice(1));
      const flat = allArgs.map(String).join("|");
      expect(flat).toContain(attackerSocket);
      expect(flat).not.toContain("9.9.9.9");
    } finally {
      process.env.TRUSTED_PROXIES = origProxy;
    }
  });
});
