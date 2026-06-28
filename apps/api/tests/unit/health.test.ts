/**
 * Unit tests for /health endpoint.
 * Tests the Hono app in isolation — no database, no server process.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { readJson } from "../helpers/json";

describe("GET /health", () => {
  it("returns HTTP 200", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("body has status='ok'", async () => {
    const app = createApp();
    const res = await app.request("/health");
    const body = await readJson(res);
    expect(body.status).toBe("ok");
  });

  it("body has ts as ISO 8601 string", async () => {
    const app = createApp();
    const res = await app.request("/health");
    const body = await readJson(res);
    expect(typeof body.ts).toBe("string");
    // ISO 8601: parseable and round-trips without NaN
    expect(Number.isNaN(Date.parse(body.ts))).toBe(false);
  });

  it("content-type is application/json", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /nonexistent", () => {
  it("returns HTTP 404", async () => {
    const app = createApp();
    const res = await app.request("/nonexistent");
    expect(res.status).toBe(404);
  });
});

describe("GET /readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("401 и не трогает БД без bearer-токена", async () => {
    vi.stubEnv("READINESS_TOKEN", "readiness-secret");
    const fakeSql = Object.assign(vi.fn().mockResolvedValue([]), {
      begin: vi.fn(),
      end: vi.fn(),
      reserve: vi.fn(),
    }) as unknown as import("postgres").Sql;
    const app = createApp(fakeSql);
    const res = await app.request("/readiness");
    expect(res.status).toBe(401);
    expect(fakeSql).not.toHaveBeenCalled();
  });

  it("401 и не трогает БД в production без настроенного READINESS_TOKEN", async () => {
    vi.stubEnv("READINESS_TOKEN", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DOMAIN", "example.test");
    const fakeSql = Object.assign(vi.fn().mockResolvedValue([]), {
      begin: vi.fn(),
      end: vi.fn(),
      reserve: vi.fn(),
    }) as unknown as import("postgres").Sql;
    const app = createApp(fakeSql);
    const res = await app.request("/readiness");
    expect(res.status).toBe(401);
    expect(fakeSql).not.toHaveBeenCalled();
  });

  it("503 когда sql не передан", async () => {
    vi.stubEnv("READINESS_TOKEN", "readiness-secret");
    const app = createApp();
    const res = await app.request("/readiness", {
      headers: { authorization: "Bearer readiness-secret" },
    });
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.reason).toBe("no_db");
  });

  it("200 когда sql работает", async () => {
    vi.stubEnv("READINESS_TOKEN", "readiness-secret");
    const fakeSql = Object.assign(vi.fn().mockResolvedValue([]), {
      begin: vi.fn(),
      end: vi.fn(),
      reserve: vi.fn(),
    }) as unknown as import("postgres").Sql;
    const app = createApp(fakeSql);
    const res = await app.request("/readiness", {
      headers: { authorization: "Bearer readiness-secret" },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("ok");
  });

  it("503 когда sql бросает ошибку", async () => {
    vi.stubEnv("READINESS_TOKEN", "readiness-secret");
    const fakeSql = Object.assign(vi.fn().mockRejectedValue(new Error("db down")), {
      begin: vi.fn(),
      end: vi.fn(),
      reserve: vi.fn(),
    }) as unknown as import("postgres").Sql;
    const app = createApp(fakeSql);
    const res = await app.request("/readiness", {
      headers: { authorization: "Bearer readiness-secret" },
    });
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.reason).toBe("db_unreachable");
  });
});
