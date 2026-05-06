import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createClientErrorsRouter } from "../../../src/client-errors/clientErrorsRouter";

function makeSql() {
  const mock = vi.fn().mockResolvedValue([]);
  // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
  return mock as any;
}

function makeApp(sql = makeSql()) {
  const app = new Hono();
  app.route("/api/client-errors", createClientErrorsRouter(sql));
  return { app, sql };
}

describe("POST /api/client-errors", () => {
  it("valid error → 200 ok: true", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Uncaught TypeError: x is undefined", url: "/#/feed" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(sql).toHaveBeenCalledTimes(1);
    const callStr = JSON.stringify(sql.mock.calls[0]);
    expect(callStr).toContain("error_log");
  });

  it("missing message → 422", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack: "only stack no message" }),
    });
    expect(res.status).toBe(422);
    expect(sql).not.toHaveBeenCalled();
  });

  it("non-JSON body → 422", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(422);
    expect(sql).not.toHaveBeenCalled();
  });

  it("PII sanitized из message", async () => {
    const { app, sql } = makeApp();
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Error: token=abc999secret Bearer xyz123" }),
    });
    expect(res.status).toBe(200);
    const callStr = JSON.stringify(sql.mock.calls[0]);
    expect(callStr).not.toContain("abc999secret");
    expect(callStr).not.toContain("xyz123");
  });

  it("message слишком длинное (>500 символов) → 422", async () => {
    const { app } = makeApp();
    const res = await app.request("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "x".repeat(501) }),
    });
    expect(res.status).toBe(422);
  });
});
