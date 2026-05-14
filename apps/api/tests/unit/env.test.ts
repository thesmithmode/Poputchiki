import { parseApiEnv, parseWebhookEnv } from "@poputchiki/shared/env";
/**
 * Unit tests: env vars validation — fail-fast при старте если обязательные переменные не заданы.
 */
import { describe, expect, it } from "vitest";

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

const VALID_WEBHOOK_ENV = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/db",
  BOT_TOKEN: "1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg",
  WEBHOOK_SECRET: "super-secret-webhook-token-32chars",
  DOMAIN: "example.com",
};

describe("parseWebhookEnv", () => {
  it("валидный env → возвращает распарсенный объект", () => {
    const env = parseWebhookEnv(VALID_WEBHOOK_ENV);
    expect(env.DATABASE_URL).toBe(VALID_WEBHOOK_ENV.DATABASE_URL);
    expect(env.BOT_TOKEN).toBe(VALID_WEBHOOK_ENV.BOT_TOKEN);
    expect(env.WEBHOOK_SECRET).toBe(VALID_WEBHOOK_ENV.WEBHOOK_SECRET);
    expect(env.DOMAIN).toBe("example.com");
  });

  it("WEBHOOK_PORT опциональный — дефолт 3001", () => {
    const env = parseWebhookEnv(VALID_WEBHOOK_ENV);
    expect(env.WEBHOOK_PORT).toBe(3001);
  });

  it("WEBHOOK_SECRET отсутствует → бросает ошибку", () => {
    const { WEBHOOK_SECRET: _, ...noSecret } = VALID_WEBHOOK_ENV;
    expect(() => parseWebhookEnv(noSecret)).toThrow();
  });

  it("WEBHOOK_SECRET короче 16 символов → бросает ошибку", () => {
    expect(() => parseWebhookEnv({ ...VALID_WEBHOOK_ENV, WEBHOOK_SECRET: "short" })).toThrow();
  });

  it("DATABASE_URL отсутствует → бросает ошибку", () => {
    const { DATABASE_URL: _, ...noDb } = VALID_WEBHOOK_ENV;
    expect(() => parseWebhookEnv(noDb)).toThrow();
  });
});
