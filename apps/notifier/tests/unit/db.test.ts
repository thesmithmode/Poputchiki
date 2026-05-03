import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDsn } from "../../src/db.js";

const ENV_KEYS = [
  "DATABASE_URL_TEST",
  "DATABASE_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

describe("buildDsn", () => {
  const origValues = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      origValues.set(k, process.env[k]);
      Reflect.deleteProperty(process.env, k);
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      const val = origValues.get(k);
      if (val !== undefined) {
        process.env[k] = val;
      } else {
        Reflect.deleteProperty(process.env, k);
      }
    }
    vi.restoreAllMocks();
  });

  it("prefers DATABASE_URL_TEST", () => {
    process.env.DATABASE_URL_TEST = "postgres://test:test@testhost/testdb";
    process.env.DATABASE_URL = "postgres://other/db";
    expect(buildDsn()).toBe("postgres://test:test@testhost/testdb");
  });

  it("falls back to DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://main/maindb";
    expect(buildDsn()).toBe("postgres://main/maindb");
  });

  it("builds DSN from POSTGRES_* vars", () => {
    process.env.POSTGRES_USER = "pguser";
    process.env.POSTGRES_PASSWORD = "pgpass";
    process.env.POSTGRES_HOST = "pghost";
    process.env.POSTGRES_PORT = "5433";
    process.env.POSTGRES_DB = "pgdb";
    expect(buildDsn()).toBe("postgres://pguser:pgpass@pghost:5433/pgdb");
  });

  it("uses defaults for host and port when not set", () => {
    process.env.POSTGRES_USER = "u";
    process.env.POSTGRES_PASSWORD = "p";
    process.env.POSTGRES_DB = "d";
    const dsn = buildDsn();
    expect(dsn).toContain("localhost");
    expect(dsn).toContain("5432");
  });
});
