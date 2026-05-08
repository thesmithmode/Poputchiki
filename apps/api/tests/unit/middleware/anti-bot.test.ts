import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { antiBot } from "../../../src/middleware/anti-bot";

type SqlMock = ReturnType<typeof vi.fn>;

function makeApp(sqlRows: unknown[][], role = "user") {
  const sql = vi.fn() as SqlMock;
  let callIdx = 0;
  sql.mockImplementation(() => {
    const result = sqlRows[callIdx] ?? [];
    callIdx++;
    return Promise.resolve(result);
  });

  const app = new Hono();
  app.use("/test", antiBot(sql as never));
  app.post("/test", (c) => {
    return c.json({ ok: true });
  });

  return { app, sql, setUser: (u: unknown) => u, role };
}

describe("antiBot middleware", () => {
  it("пропускает когда нет user (публичный route)", async () => {
    const { app } = makeApp([]);
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("пропускает admin без DB-запроса", async () => {
    const sql = vi.fn();
    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "admin" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("пропускает если user не найден в DB", async () => {
    const sql = vi.fn().mockResolvedValue([]);
    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("новый аккаунт (<24ч) + активный ride → 403 too_new", async () => {
    const sql = vi.fn();
    const newCreatedAt = new Date(Date.now() - 1000 * 60 * 60); // 1 час назад
    sql
      .mockResolvedValueOnce([{ created_at: newCreatedAt, likes_received_count: 5 }])
      .mockResolvedValueOnce([{ count: 1 }]);

    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("too_new");
  });

  it("новый аккаунт + нет активных rides → проходит", async () => {
    const sql = vi.fn();
    const newCreatedAt = new Date(Date.now() - 1000 * 60 * 60);
    sql
      .mockResolvedValueOnce([{ created_at: newCreatedAt, likes_received_count: 5 }])
      .mockResolvedValueOnce([{ count: 0 }]);

    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("likes_received_count=0 + дневной лимит ≥3 → 403 unverified_daily_limit", async () => {
    const sql = vi.fn();
    const oldCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 48); // 2 дня
    sql
      .mockResolvedValueOnce([{ created_at: oldCreatedAt, likes_received_count: 0 }])
      .mockResolvedValueOnce([{ count: 3 }]);

    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("unverified_daily_limit");
  });

  it("likes_received_count=0 + дневных rides <3 → проходит", async () => {
    const sql = vi.fn();
    const oldCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 48);
    sql
      .mockResolvedValueOnce([{ created_at: oldCreatedAt, likes_received_count: 0 }])
      .mockResolvedValueOnce([{ count: 2 }]);

    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("старый аккаунт с likes → проходит без ограничений", async () => {
    const sql = vi.fn();
    const oldCreatedAt = new Date(Date.now() - 1000 * 60 * 60 * 48);
    sql.mockResolvedValueOnce([{ created_at: oldCreatedAt, likes_received_count: 10 }]);

    const app = new Hono();
    app.use("/test", async (c, next) => {
      c.set("user" as never, { id: "u1", role: "user" });
      await next();
    });
    app.use("/test", antiBot(sql as never));
    app.post("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
