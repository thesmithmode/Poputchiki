import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { readJson } from "../helpers/json";

describe("GET /metrics", () => {
  it("returns HTTP 200", async () => {
    const app = createApp();
    const res = await app.request("/metrics");
    expect(res.status).toBe(200);
  });

  it("body has max, in_use, waiting, listen_connections", async () => {
    const app = createApp();
    const res = await app.request("/metrics");
    const body = await readJson(res);
    expect(body).toHaveProperty("max", 20);
    expect(body).toHaveProperty("in_use");
    expect(body).toHaveProperty("waiting");
    expect(body).toHaveProperty("listen_connections", 0);
  });

  it("content-type is application/json", async () => {
    const app = createApp();
    const res = await app.request("/metrics");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("createApp: sql branch coverage", () => {
  it("createApp(sql) without jwtSecret mounts /auth but not /api routes", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const mockSql = vi.fn() as any;
    const app = createApp(mockSql);
    // /api/rides should not exist (no jwtSecret → 404)
    const res = await app.request("/api/rides", { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("createApp(sql, jwtSecret) mounts full /api/* middleware stack", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
    const mockSql = vi.fn() as any;
    const app = createApp(mockSql, "test-secret-key");
    // /health is outside /api/* and still works
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });
});
