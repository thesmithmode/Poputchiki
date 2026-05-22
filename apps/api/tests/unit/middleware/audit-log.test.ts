import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { auditLog } from "../../../src/middleware/audit-log";
import type { AppUser } from "../../../src/middleware/identity-guard";

const USER: AppUser = { id: "00000000-0000-4000-a000-a01d00000001", tgId: 6001, role: "user" };

interface SqlMock {
  (...args: unknown[]): Promise<unknown[]>;
  tx: ReturnType<typeof vi.fn>;
  begin: ReturnType<typeof vi.fn>;
}

function makeSql(): SqlMock {
  const tx = vi.fn().mockResolvedValue([]);
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  const sql = vi.fn().mockResolvedValue([]) as any as SqlMock;
  sql.tx = tx;
  sql.begin = vi.fn().mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  // postgres.js helper — для теста сериализуем в строку (имитация wire format),
  // assertions ниже парсят JSON из interpolation.
  // biome-ignore lint/suspicious/noExplicitAny: mock json helper
  (sql as any).json = (v: unknown) => JSON.stringify(v);
  return sql;
}

// biome-ignore lint/suspicious/noExplicitAny: test helper
function makeApp(sql: any = makeSql(), user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.use("*", auditLog(sql));
  app.post("/api/rides", (c) => c.json({ id: "ride-1" }, 201));
  app.get("/api/rides", (c) => c.json({ rides: [] }, 200));
  app.post("/api/fail", (c) => c.json({ error: "bad" }, 422));
  app.delete("/api/rides/00000000-0000-4000-a000-000000000001", (c) => c.json({}, 200));
  app.put("/", (c) => c.json({}, 200));
  return { app, sql };
}

// Helper: get the INSERT call args from the tx mock (call index 1, after SET LOCAL ROLE)
function txInsertArgs(sql: ReturnType<typeof makeSql>) {
  // tx call[0] = SET LOCAL ROLE, tx call[1] = INSERT
  return sql.tx.mock.calls[1]?.slice(1) as unknown[] | undefined;
}

describe("auditLog middleware", () => {
  it("POST 201 → audit INSERT called via sql.begin", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "A" }),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).toHaveBeenCalled();
    const insertCall = sql.tx.mock.calls[1];
    const queryStr = String(insertCall?.[0]);
    expect(queryStr).toContain("audit_log");
  });

  it("GET → NO audit INSERT", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides");
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it("POST 422 (client error) → NO audit INSERT", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/fail", { method: "POST", body: "{}" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).not.toHaveBeenCalled();
  });

  it("DELETE with UUID path param → entity_id extracted", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides/00000000-0000-4000-a000-000000000001", {
      method: "DELETE",
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).toHaveBeenCalled();
    const interpolations = txInsertArgs(sql);
    expect(
      interpolations?.some((v: unknown) =>
        String(v).includes("00000000-0000-4000-a000-000000000001"),
      ),
    ).toBe(true);
  });

  it("audit INSERT failure does not throw / swallowed", async () => {
    const sql = makeSql();
    sql.begin = vi.fn().mockRejectedValue(new Error("DB down"));
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const { app } = makeApp(sql as any, USER);
    const res = await app.request("/api/rides", { method: "POST", body: "{}" });
    expect(res.status).toBe(201);
  });

  it("action field = METHOD + path", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides", {
      method: "POST",
      body: "{}",
    });
    await new Promise((r) => setTimeout(r, 10));
    const interpolations = txInsertArgs(sql);
    expect(interpolations?.some((v: unknown) => String(v) === "POST /api/rides")).toBe(true);
  });

  it("POST without user in context → user_id interpolated as null", async () => {
    const { app, sql } = makeApp(); // no USER → user undefined
    await app.request("/api/rides", { method: "POST", body: "{}" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).toHaveBeenCalled();
    const interpolations = txInsertArgs(sql);
    expect(interpolations?.includes(null)).toBe(true);
  });

  it("PUT to root path → entity defaults to 'api' (empty parts fallback)", async () => {
    const { app, sql } = makeApp();
    await app.request("/", { method: "PUT" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).toHaveBeenCalled();
    const interpolations = txInsertArgs(sql);
    expect(interpolations?.some((v: unknown) => String(v) === "api")).toBe(true);
  });

  it("payload_hash present in meta (sha256 hex, 64 chars)", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "test" }),
    });
    await new Promise((r) => setTimeout(r, 10));
    const interpolations = txInsertArgs(sql);
    const metaArg = interpolations?.find(
      (v: unknown) => typeof v === "string" && v.includes("payload_hash"),
    );
    const meta = JSON.parse(String(metaArg).replace("::jsonb", ""));
    expect(typeof meta.payload_hash).toBe("string");
    expect(meta.payload_hash.length).toBe(64);
  });

  it("oversized body (Content-Length > 1MB) → payload_hash = 'oversized'", async () => {
    // FIX A2: при Content-Length > 1MB audit-log не клонирует тело, записывает "oversized"
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Имитируем Content-Length > 1MB (1_100_000 байт)
        "Content-Length": "1100000",
      },
      body: JSON.stringify({ data: "small but header says big" }),
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql.begin).toHaveBeenCalled();
    const interpolations = txInsertArgs(sql);
    const metaArg = interpolations?.find(
      (v: unknown) => typeof v === "string" && v.includes("payload_hash"),
    );
    const meta = JSON.parse(String(metaArg).replace("::jsonb", ""));
    expect(meta.payload_hash).toBe("oversized");
  });
});
