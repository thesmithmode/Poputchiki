import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { auditLog } from "../../../src/middleware/audit-log";
import type { AppUser } from "../../../src/middleware/identity-guard";

const USER: AppUser = { id: "00000000-0000-4000-a000-a01d00000001", tgId: 6001, role: "user" };

function makeSql() {
  const mock = vi.fn().mockResolvedValue([]);
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return mock as any;
}

function makeApp(sql = makeSql(), user?: AppUser) {
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

describe("auditLog middleware", () => {
  it("POST 201 → audit INSERT called", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: "A" }),
    });
    // Give the fire-and-forget promise time to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).toHaveBeenCalled();
    const call = sql.mock.calls[0];
    const queryStr = String(call?.[0]);
    expect(queryStr).toContain("audit_log");
  });

  it("GET → NO audit INSERT", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides");
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).not.toHaveBeenCalled();
  });

  it("POST 422 (client error) → NO audit INSERT", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/fail", { method: "POST", body: "{}" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).not.toHaveBeenCalled();
  });

  it("DELETE with UUID path param → entity_id extracted", async () => {
    const { app, sql } = makeApp(makeSql(), USER);
    await app.request("/api/rides/00000000-0000-4000-a000-000000000001", {
      method: "DELETE",
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).toHaveBeenCalled();
    const interpolations = sql.mock.calls[0]?.slice(1);
    expect(
      interpolations?.some((v: unknown) =>
        String(v).includes("00000000-0000-4000-a000-000000000001"),
      ),
    ).toBe(true);
  });

  it("audit INSERT failure does not throw / swallowed", async () => {
    const badSql = vi.fn().mockRejectedValue(new Error("DB down"));
    // biome-ignore lint/suspicious/noExplicitAny: mock
    const { app } = makeApp(badSql as any, USER);
    // Should not throw
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
    const interpolations = sql.mock.calls[0]?.slice(1);
    expect(interpolations?.some((v: unknown) => String(v) === "POST /api/rides")).toBe(true);
  });

  it("POST without user in context → user_id interpolated as null", async () => {
    const { app, sql } = makeApp(); // no USER → user undefined
    await app.request("/api/rides", { method: "POST", body: "{}" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).toHaveBeenCalled();
    const interpolations = sql.mock.calls[0]?.slice(1);
    expect(interpolations?.includes(null)).toBe(true);
  });

  it("PUT to root path → entity defaults to 'api' (empty parts fallback)", async () => {
    const { app, sql } = makeApp();
    await app.request("/", { method: "PUT" });
    await new Promise((r) => setTimeout(r, 10));
    expect(sql).toHaveBeenCalled();
    const interpolations = sql.mock.calls[0]?.slice(1);
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
    const interpolations = sql.mock.calls[0]?.slice(1);
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
    expect(sql).toHaveBeenCalled();
    const interpolations = sql.mock.calls[0]?.slice(1);
    const metaArg = interpolations?.find(
      (v: unknown) => typeof v === "string" && v.includes("payload_hash"),
    );
    const meta = JSON.parse(String(metaArg).replace("::jsonb", ""));
    expect(meta.payload_hash).toBe("oversized");
  });
});
