import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { webhookSecret } from "../../src/middleware/webhook-secret";

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
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("returns 401 when header is wrong", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "wrong-token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("forbidden");
  });

  it("calls next and returns 200 when header matches", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  // FIX A4: timing-safe comparison — разные длины строк → 401 без сравнения
  it("returns 401 when header has different length (timing-safe early exit)", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": "short" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 when header is longer than secret (timing-safe early exit)", async () => {
    const app = buildApp(SECRET);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": `${SECRET}_extra_suffix` },
    });
    expect(res.status).toBe(401);
  });

  it("timingSafeEqual используется: одинаковая длина но другой контент → 401", async () => {
    const app = buildApp(SECRET);
    // Тот же размер, другой контент
    const sameLength = "x".repeat(SECRET.length);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "X-Telegram-Bot-Api-Secret-Token": sameLength },
    });
    expect(res.status).toBe(401);
  });
});
