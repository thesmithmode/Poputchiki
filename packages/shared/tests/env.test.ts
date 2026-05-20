import { describe, expect, it } from "vitest";
import { parseApiEnv } from "../src/env";

const BASE_VALID = {
  DATABASE_URL: "postgres://x",
  JWT_SECRET: "a".repeat(32),
  BOT_TOKEN: "bot",
  PGCRYPTO_KEY: "a".repeat(32),
};

describe("parseApiEnv — DOMAIN production gate", () => {
  it("development без DOMAIN — OK", () => {
    expect(() => parseApiEnv({ ...BASE_VALID, NODE_ENV: "development" })).not.toThrow();
  });

  it("test без DOMAIN — OK", () => {
    expect(() => parseApiEnv({ ...BASE_VALID, NODE_ENV: "test" })).not.toThrow();
  });

  it("production без DOMAIN — throw", () => {
    expect(() => parseApiEnv({ ...BASE_VALID, NODE_ENV: "production" })).toThrowError(/DOMAIN/);
  });

  it("production с пустым DOMAIN — throw", () => {
    expect(() => parseApiEnv({ ...BASE_VALID, NODE_ENV: "production", DOMAIN: "" })).toThrowError(
      /DOMAIN/,
    );
  });

  it("production с непустым DOMAIN — OK", () => {
    expect(() =>
      parseApiEnv({ ...BASE_VALID, NODE_ENV: "production", DOMAIN: "example.com" }),
    ).not.toThrow();
  });

  it("дефолт NODE_ENV=development — OK без DOMAIN", () => {
    const parsed = parseApiEnv(BASE_VALID);
    expect(parsed.NODE_ENV).toBe("development");
  });
});

describe("parseApiEnv — PGCRYPTO_KEY production gate (C2)", () => {
  it("production без PGCRYPTO_KEY — throw", () => {
    const { PGCRYPTO_KEY, ...noCrypto } = BASE_VALID;
    void PGCRYPTO_KEY;
    expect(() =>
      parseApiEnv({ ...noCrypto, NODE_ENV: "production", DOMAIN: "example.com" }),
    ).toThrowError(/PGCRYPTO_KEY/);
  });

  it("production с PGCRYPTO_KEY < 32 chars — throw", () => {
    expect(() =>
      parseApiEnv({
        ...BASE_VALID,
        NODE_ENV: "production",
        DOMAIN: "example.com",
        PGCRYPTO_KEY: "short",
      }),
    ).toThrowError(/PGCRYPTO_KEY/);
  });

  it("development без PGCRYPTO_KEY — OK (silent-fail приемлем вне prod)", () => {
    const { PGCRYPTO_KEY, ...noCrypto } = BASE_VALID;
    void PGCRYPTO_KEY;
    expect(() => parseApiEnv({ ...noCrypto, NODE_ENV: "development" })).not.toThrow();
  });
});
