/**
 * Integration: requestId middleware — reads X-Request-ID or generates uuid,
 * echoes it in response.
 */
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { requestId } from "../../src/middleware/request-id";

function makeApp(): Hono {
  const app = new Hono();
  app.use("*", requestId());
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("requestId middleware", () => {
  it("echoes X-Request-ID header from request", async () => {
    const app = makeApp();
    const res = await app.request("/test", {
      headers: { "X-Request-ID": "abc-123" },
    });
    expect(res.headers.get("X-Request-ID")).toBe("abc-123");
  });

  it("generates uuid when X-Request-ID not provided", async () => {
    const app = makeApp();
    const res = await app.request("/test");
    const id = res.headers.get("X-Request-ID");
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("two requests without header get different IDs", async () => {
    const app = makeApp();
    const [r1, r2] = await Promise.all([app.request("/test"), app.request("/test")]);
    expect(r1.headers.get("X-Request-ID")).not.toBe(r2.headers.get("X-Request-ID"));
  });
});
