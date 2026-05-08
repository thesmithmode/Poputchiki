import { Hono } from "hono";
import type postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { bannedUser } from "../../src/middleware/banned-user";
import type { AppUser } from "../../src/middleware/identity-guard";

type BanRow = { is_banned: boolean; ban_reason: string | null; banned_at: string | null };

function makeSql(row?: BanRow): postgres.Sql {
  const fn = vi.fn().mockResolvedValue(row ? [row] : []);
  return Object.assign(fn, {
    begin: vi.fn(),
    end: vi.fn(),
    reserve: vi.fn(),
  }) as unknown as postgres.Sql;
}

function makeApp(sql: postgres.Sql, user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.use("*", bannedUser(sql));
  app.get("*", (c) => c.json({ ok: true }));
  app.patch("*", (c) => c.json({ ok: true }));
  return app;
}

const testUser: AppUser = { id: "uuid-1", tgId: 123, role: "user" };

describe("bannedUser middleware", () => {
  it("GET /api/users/me bypasses ban check — no DB query, calls next", async () => {
    const sql = makeSql({ is_banned: true, ban_reason: "spam", banned_at: null });
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/users/me", { method: "GET" });
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("PATCH /api/users/me does NOT bypass ban check — banned user gets 403", async () => {
    const sql = makeSql({ is_banned: true, ban_reason: "spam", banned_at: null });
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/users/me", { method: "PATCH" });
    expect(res.status).toBe(403);
    expect(sql).toHaveBeenCalled();
  });

  it("non-banned user — calls next with 200", async () => {
    const sql = makeSql({ is_banned: false, ban_reason: null, banned_at: null });
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/rides");
    expect(res.status).toBe(200);
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it("banned user — returns 403 with error, reason, banned_at", async () => {
    const sql = makeSql({ is_banned: true, ban_reason: "spam", banned_at: "2026-01-01T00:00:00Z" });
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/rides");
    expect(res.status).toBe(403);
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const body = (await res.json()) as any;
    expect(body.error).toBe("banned");
    expect(body.reason).toBe("spam");
    expect(body.banned_at).toBe("2026-01-01T00:00:00Z");
  });

  it("banned user with null reason — returns 403 with null reason", async () => {
    const sql = makeSql({ is_banned: true, ban_reason: null, banned_at: null });
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/rides");
    expect(res.status).toBe(403);
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const body = (await res.json()) as any;
    expect(body.error).toBe("banned");
    expect(body.reason).toBeNull();
    expect(body.banned_at).toBeNull();
  });

  it("no user in context (defensive) — calls next with 200", async () => {
    const sql = makeSql();
    const app = makeApp(sql); // no user set
    const res = await app.request("/api/rides");
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("user not in DB (empty result) — calls next with 200", async () => {
    // sql returns empty array → row is undefined → is_banned check is falsy
    const fn = vi.fn().mockResolvedValue([]);
    const sql = Object.assign(fn, {
      begin: vi.fn(),
      end: vi.fn(),
      reserve: vi.fn(),
    }) as unknown as postgres.Sql;
    const app = makeApp(sql, testUser);
    const res = await app.request("/api/rides");
    expect(res.status).toBe(200);
  });
});
