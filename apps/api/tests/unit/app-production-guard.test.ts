/**
 * Unit test: createApp не выбрасывает при любых значениях DOMAIN/NODE_ENV.
 * CSRF middleware убран из /api/* (Bearer-токен обеспечивает CSRF-защиту).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";

function makeSql() {
  return vi.fn().mockResolvedValue([]) as unknown as import("postgres").Sql;
}

describe("createApp — не бросает при отсутствии DOMAIN", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production без DOMAIN → не throws", () => {
    vi.stubEnv("DOMAIN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createApp(makeSql(), "jwt-secret")).not.toThrow();
  });

  it("NODE_ENV=production с DOMAIN → не throws", () => {
    vi.stubEnv("DOMAIN", "царёво.рф");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createApp(makeSql(), "jwt-secret")).not.toThrow();
  });

  it("NODE_ENV=development без DOMAIN → не throws", () => {
    vi.stubEnv("DOMAIN", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => createApp(makeSql(), "jwt-secret")).not.toThrow();
  });
});
