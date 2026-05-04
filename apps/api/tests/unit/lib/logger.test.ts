/**
 * Unit tests: pino logger redaction — секреты и PII скрываются.
 */
import { describe, expect, it } from "vitest";
import { REDACT_PATHS, createLogger } from "../../../src/lib/logger";

describe("REDACT_PATHS", () => {
  it("содержит authorization header", () => {
    expect(REDACT_PATHS).toContain("req.headers.authorization");
  });

  it("содержит cookie header", () => {
    expect(REDACT_PATHS).toContain("req.headers.cookie");
  });

  it("содержит body.initData", () => {
    expect(REDACT_PATHS).toContain("body.initData");
  });

  it("содержит body.access_token", () => {
    expect(REDACT_PATHS).toContain("body.access_token");
  });

  it("содержит body.refresh_token", () => {
    expect(REDACT_PATHS).toContain("body.refresh_token");
  });

  it("содержит body.phone", () => {
    expect(REDACT_PATHS).toContain("body.phone");
  });

  it("содержит body.apt_number", () => {
    expect(REDACT_PATHS).toContain("body.apt_number");
  });
});

describe("createLogger redaction", () => {
  it("createLogger возвращает pino-like объект с методами log/info/warn/error", () => {
    const logger = createLogger();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("redact пути включены в конфиг логгера", () => {
    const logger = createLogger({ testMode: true }) as { _redactPaths: string[] };
    expect(logger._redactPaths).toEqual(expect.arrayContaining(REDACT_PATHS));
  });
});
