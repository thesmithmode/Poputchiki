import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { csrf } from "../../../src/middleware/csrf";

const CSRF_TOKEN = "test-csrf-token-abc123";
const ORIGIN = "https://app.example.com";

function makeApp(allowedOrigin?: string) {
  const app = new Hono();
  app.use("*", csrf(allowedOrigin));
  app.post("/api/data", (c) => c.json({ ok: true }, 200));
  app.get("/api/data", (c) => c.json({ ok: true }, 200));
  return app;
}

function makeHeaders(overrides: Record<string, string> = {}) {
  return {
    "X-CSRF-Token": CSRF_TOKEN,
    Cookie: `csrf_token=${CSRF_TOKEN}`,
    ...overrides,
  };
}

describe("csrf middleware", () => {
  it("GET → no CSRF check → 200", async () => {
    const app = makeApp();
    const res = await app.request("/api/data");
    expect(res.status).toBe(200);
  });

  it("POST with matching token → 200", async () => {
    const app = makeApp();
    const res = await app.request("/api/data", {
      method: "POST",
      headers: makeHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it("POST without X-CSRF-Token header → 403", async () => {
    const app = makeApp();
    const res = await app.request("/api/data", {
      method: "POST",
      headers: { Cookie: `csrf_token=${CSRF_TOKEN}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("csrf");
  });

  it("POST with mismatched token → 403", async () => {
    const app = makeApp();
    const res = await app.request("/api/data", {
      method: "POST",
      headers: {
        "X-CSRF-Token": "wrong-token",
        Cookie: `csrf_token=${CSRF_TOKEN}`,
      },
    });
    expect(res.status).toBe(403);
  });

  it("POST without csrf_token cookie → 403", async () => {
    const app = makeApp();
    const res = await app.request("/api/data", {
      method: "POST",
      headers: { "X-CSRF-Token": CSRF_TOKEN },
    });
    expect(res.status).toBe(403);
  });

  it("Origin check: correct origin → 200", async () => {
    const app = makeApp(ORIGIN);
    const res = await app.request("/api/data", {
      method: "POST",
      headers: { ...makeHeaders(), Origin: ORIGIN },
    });
    expect(res.status).toBe(200);
  });

  it("Origin check: wrong origin → 403", async () => {
    const app = makeApp(ORIGIN);
    const res = await app.request("/api/data", {
      method: "POST",
      headers: { ...makeHeaders(), Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("origin");
  });

  it("Origin check: no origin header when origin required → 403", async () => {
    const app = makeApp(ORIGIN);
    const res = await app.request("/api/data", {
      method: "POST",
      headers: makeHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("no allowedOrigin configured → origin not checked", async () => {
    const app = makeApp(undefined);
    const res = await app.request("/api/data", {
      method: "POST",
      headers: makeHeaders(), // No Origin header
    });
    expect(res.status).toBe(200);
  });
});
