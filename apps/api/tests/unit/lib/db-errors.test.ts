import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { isUniqueViolation } from "../../../src/lib/db-errors";

describe("isUniqueViolation", () => {
  it("postgres-style error with code 23505 → true", () => {
    expect(isUniqueViolation({ code: "23505", message: "duplicate key" })).toBe(true);
  });

  it("error with different code → false", () => {
    expect(isUniqueViolation({ code: "23502", message: "not null violation" })).toBe(false);
  });

  it("non-object → false", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation("string")).toBe(false);
    expect(isUniqueViolation(42)).toBe(false);
  });

  it("object without code → false", () => {
    expect(isUniqueViolation({ message: "some error" })).toBe(false);
  });

  it("SENTINEL: complaints antispam — 23505 → 409 pattern", async () => {
    // Demonstrates the expected handler pattern for complaints endpoint (TASK-032).
    // When DB throws unique_violation, the route must return 409.
    const sql = vi.fn().mockRejectedValueOnce({ code: "23505" });

    const app = new Hono();
    app.post("/api/complaints", async (c) => {
      try {
        // biome-ignore lint/suspicious/noExplicitAny: mock call
        await (sql as any)`INSERT INTO complaints ...`;
        return c.json({ ok: true }, 201);
      } catch (err) {
        if (isUniqueViolation(err)) {
          return c.json({ error: "duplicate_complaint" }, 409);
        }
        return c.json({ error: "internal" }, 500);
      }
    });

    const res = await app.request("/api/complaints", { method: "POST" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("duplicate_complaint");
  });
});
