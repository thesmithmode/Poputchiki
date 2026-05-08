/**
 * Unit test: A3 production fail-closed guard — createApp выбрасывает при отсутствии DOMAIN в production
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";

function makeSql() {
  return vi.fn().mockResolvedValue([]) as unknown as import("postgres").Sql;
}

describe("createApp production DOMAIN guard (A3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production без DOMAIN → throws", () => {
    vi.stubEnv("DOMAIN", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => createApp(makeSql(), "jwt-secret")).toThrow(
      "DOMAIN env var required in production for CSRF origin check",
    );
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

  it("NODE_ENV не задан (пустой), без DOMAIN → не throws", () => {
    vi.stubEnv("DOMAIN", "");
    vi.stubEnv("NODE_ENV", "");
    expect(() => createApp(makeSql(), "jwt-secret")).not.toThrow();
  });
});
