import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { webhookSecret } from "../src/middleware/webhook-secret";

function buildApp(secret: string) {
  const app = new Hono();
  app.post("/test", webhookSecret(secret), (c) => c.json({ ok: true }));
  return app;
}

describe("webhookSecret middleware", () => {
  const SECRET = "my-secret-token-1234";

  it("returns 401 when header is missing", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 when header is wrong", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-token" },
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("calls next and returns 200 when header matches", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
