import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { idempotency } from "../../../src/middleware/idempotency";
import { readJson } from "../../helpers/json";

const KEY = "test-idempotency-key-abc";

// postgres.js .json() helper — мок сериализует объект в строку
// (имитация wire-format). Используется внутри idempotency middleware.
// biome-ignore lint/suspicious/noExplicitAny: mock json helper attach
function withJson<T>(sql: T): T {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic attach
  (sql as any).json = (v: unknown) => JSON.stringify(v);
  return sql;
}

describe("idempotency middleware", () => {
  it("GET → not intercepted (no key check)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.get("/api/rides", (c) => c.json({ rides: [] }, 200));
    const res = await app.request("/api/rides");
    expect(res.status).toBe(200);
    expect(sql).not.toHaveBeenCalled();
  });

  it("POST without Idempotency-Key → passes through normally", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "new-ride" }, 201));
    const res = await app.request("/api/rides", { method: "POST" });
    expect(res.status).toBe(201);
    expect(sql).not.toHaveBeenCalled();
  });

  it("POST with key, claim wins → executes + persists response", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql
      .mockResolvedValueOnce([{ key: KEY }]) // INSERT sentinel — wins
      .mockResolvedValueOnce([]); // UPDATE response

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "new-ride" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("POST with key, claim lost, cached response present → returns cached", async () => {
    const cachedBody = { id: "cached-ride" };
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql
      .mockResolvedValueOnce([]) // INSERT — lost (key already exists)
      .mockResolvedValueOnce([{ response: { status_code: 201, body: cachedBody } }]); // SELECT cached

    const handler = vi.fn((c: { json: (b: unknown, s: number) => unknown }) =>
      c.json({ id: "fresh" }, 201),
    );
    const app = new Hono();
    app.use("*", idempotency(sql));
    // biome-ignore lint/suspicious/noExplicitAny: vitest mock not assignable to Hono Handler
    app.post("/api/rides", handler as any);

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
    expect((await readJson(res)).id).toBe("cached-ride");
    expect(handler).not.toHaveBeenCalled(); // route never ran
  });

  it("REGRESSION: concurrent requests with same key — only one runs handler", async () => {
    // Simulate a race: both requests' INSERT race; one wins, one loses.
    let inserts = 0;
    let handlerRuns = 0;
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT INTO idempotency_keys")) {
        inserts++;
        // First insert wins, second loses (returns empty array)
        return Promise.resolve(inserts === 1 ? [{ key: KEY }] : []);
      }
      if (text.includes("SELECT response FROM idempotency_keys")) {
        // After winner finishes, loser SELECTs and gets cached value.
        return Promise.resolve([{ response: { status_code: 201, body: { id: "winner" } } }]);
      }
      if (text.includes("UPDATE idempotency_keys")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);

    const handler = (c: { json: (b: unknown, s: number) => Response }) => {
      handlerRuns++;
      return c.json({ id: "winner" }, 201);
    };
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", handler);

    const [r1, r2] = await Promise.all([
      app.request("/api/rides", { method: "POST", headers: { "Idempotency-Key": KEY } }),
      app.request("/api/rides", { method: "POST", headers: { "Idempotency-Key": KEY } }),
    ]);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(handlerRuns).toBe(1); // critical: only winner ran
  });

  it("POST with key, claim lost, sentinel still pending → 409", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql
      .mockResolvedValueOnce([]) // INSERT — lost
      .mockResolvedValueOnce([{ response: { _pending: true } }]); // SELECT — still pending

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "x" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(409);
  });

  it("POST with key, claim lost, key expired (>24h) → 409", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql
      .mockResolvedValueOnce([]) // INSERT — lost
      .mockResolvedValueOnce([]); // SELECT (with 24h filter) — empty = expired

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "x" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(409);
  });

  it("POST with key, handler throws → sentinel released (DELETE called)", async () => {
    const calls: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) {
        calls.push("INSERT");
        return Promise.resolve([{ key: KEY }]);
      }
      if (text.includes("DELETE")) {
        calls.push("DELETE");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", () => {
      throw new Error("boom");
    });

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(500);
    expect(calls).toContain("INSERT");
    expect(calls).toContain("DELETE");
  });

  it("POST with key, handler throws + DELETE rejects → catch arrow swallows", async () => {
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) return Promise.resolve([{ key: KEY }]);
      if (text.includes("DELETE")) return Promise.reject(new Error("db dead"));
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", () => {
      throw new Error("boom");
    });
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(500);
  });

  it("POST with key, INSERT throws → next() called, no claim", async () => {
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) return Promise.reject(new Error("db down"));
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "ok" }, 201));
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
  });

  it("POST claim lost, no cached row (>24h expired) → 409 expired", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "x" }, 201));
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("idempotency_key_expired");
  });

  it("POST claim won + UPDATE throws → swallowed, response still returned", async () => {
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) return Promise.resolve([{ key: KEY }]);
      if (text.includes("UPDATE")) return Promise.reject(new Error("update fail"));
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "ok" }, 201));
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
  });

  it("POST claim won + non-JSON body → stored as null", async () => {
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) return Promise.resolve([{ key: KEY }]);
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);
    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.text("plain", 201));
    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
  });

  it("POST with key, non-2xx response → sentinel released (client may retry)", async () => {
    const calls: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("INSERT")) {
        calls.push("INSERT");
        return Promise.resolve([{ key: KEY }]);
      }
      if (text.includes("DELETE")) {
        calls.push("DELETE");
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }) as unknown as Parameters<typeof idempotency>[0];
    withJson(sql);

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ error: "bad" }, 422));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(422);
    expect(calls).toContain("DELETE");
  });

  it("POST with key, INSERT throws → falls through to next() (best-effort)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql.mockRejectedValueOnce(new Error("DB down"));

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "ok" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
  });

  it("POST with key, claim wins, user in context → response stored with user_id", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql.mockResolvedValueOnce([{ key: KEY }]).mockResolvedValueOnce([]);

    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("user" as never, { id: "user-abc", tgId: 1, role: "user" });
      await next();
    });
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "new-ride" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("POST with key, non-JSON response body → stored as null, status preserved", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql.mockResolvedValueOnce([{ key: KEY }]).mockResolvedValueOnce([]);

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/text", (c) => c.text("OK", 200));

    const res = await app.request("/api/text", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(200);
    expect(sql).toHaveBeenCalledTimes(2);
  });

  it("POST with key, UPDATE throws → response still returned (best-effort)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const sql = withJson(vi.fn() as any);
    sql
      .mockResolvedValueOnce([{ key: KEY }]) // INSERT wins
      .mockRejectedValueOnce(new Error("UPDATE failed")); // UPDATE fails

    const app = new Hono();
    app.use("*", idempotency(sql));
    app.post("/api/rides", (c) => c.json({ id: "new-ride" }, 201));

    const res = await app.request("/api/rides", {
      method: "POST",
      headers: { "Idempotency-Key": KEY },
    });
    expect(res.status).toBe(201);
  });
});
