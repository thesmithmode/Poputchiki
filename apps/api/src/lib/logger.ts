import pino from "pino";

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "body.initData",
  "body.access_token",
  "body.refresh_token",
  "body.phone",
  "body.apt_number",
  "*.BOT_TOKEN",
  "*.JWT_SECRET",
  "*.POSTGRES_PASSWORD",
  "*.PGCRYPTO_KEY",
];

interface CreateLoggerOptions {
  testMode?: boolean;
}

interface TestLogger extends pino.Logger {
  _redactPaths: string[];
}

export function createLogger(opts?: CreateLoggerOptions): pino.Logger | TestLogger {
  const logger = pino({
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
    },
  });

  if (opts?.testMode) {
    (logger as TestLogger)._redactPaths = REDACT_PATHS;
    return logger as TestLogger;
  }

  return logger;
}

export const logger = createLogger();
