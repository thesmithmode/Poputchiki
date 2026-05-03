/**
 * Unit tests: env vars validation — fail-fast при старте если обязательные переменные не заданы.
 */
import { describe, expect, it } from "vitest";
import { parseApiEnv } from "@poputchiki/shared/env";

const VALID_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  JWT_SECRET: "super-secret-key-32-chars-minimum!!",
  BOT_TOKEN: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
  ADMIN_TG_ID: "123456789",
};

describe("parseApiEnv", () => {
  it("валидный env → возвращает распарсенный объект", () => {
    const env = parseApiEnv(VALID_ENV);
    expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
    expect(env.JWT_SECRET).toBe(VALID_ENV.JWT_SECRET);
    expect(env.BOT_TOKEN).toBe(VALID_ENV.BOT_TOKEN);
  });

  it("DATABASE_URL отсутствует → бросает ZodError", () => {
    const { DATABASE_URL: _, ...noDb } = VALID_ENV;
    expect(() => parseApiEnv(noDb)).toThrow();
  });

  it("JWT_SECRET отсутствует → бросает ZodError", () => {
    const { JWT_SECRET: _, ...noJwt } = VALID_ENV;
    expect(() => parseApiEnv(noJwt)).toThrow();
  });

  it("BOT_TOKEN отсутствует → бросает ZodError", () => {
    const { BOT_TOKEN: _, ...noBot } = VALID_ENV;
    expect(() => parseApiEnv(noBot)).toThrow();
  });

  it("DATABASE_URL пустая строка → бросает ZodError", () => {
    expect(() => parseApiEnv({ ...VALID_ENV, DATABASE_URL: "" })).toThrow();
  });

  it("JWT_SECRET слишком короткий (менее 16 символов) → бросает ZodError", () => {
    expect(() => parseApiEnv({ ...VALID_ENV, JWT_SECRET: "short" })).toThrow();
  });

  it("PORT невалидный (не число) → бросает ZodError", () => {
    expect(() => parseApiEnv({ ...VALID_ENV, PORT: "not-a-number" })).toThrow();
  });

  it("TRUSTED_PROXIES опциональный — без него работает", () => {
    const env = parseApiEnv(VALID_ENV);
    expect(env.TRUSTED_PROXIES).toBeUndefined();
  });

  it("PORT опциональный — без него дефолт 3000", () => {
    const env = parseApiEnv(VALID_ENV);
    expect(env.PORT).toBe(3000);
  });
});
