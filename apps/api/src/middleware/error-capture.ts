import type { Hono } from "hono";
import type postgres from "postgres";

const PII_PATTERN =
  /Bearer\s+\S+|password[=:]\s*\S+|token[=:]\s*\S+|initData[=:]\s*\S+|secret[=:]\s*\S+/gi;

function sanitize(message: string): string {
  return message.replace(PII_PATTERN, "[REDACTED]");
}

export interface ErrorCaptureOptions {
  sampleRate?: number; // 0..1, default 1 in dev / 0.1 in prod
}

export function setupErrorCapture(app: Hono, sql: postgres.Sql, opts?: ErrorCaptureOptions): void {
  const sampleRate = opts?.sampleRate ?? (process.env.NODE_ENV === "production" ? 0.1 : 1);

  app.onError(async (err, c) => {
    if (Math.random() <= sampleRate) {
      /* c8 ignore next 2 -- err.message/stack always present for real Error objects */
      const message = sanitize(err.message ?? "unknown error");
      const stack = sanitize((err.stack ?? "").slice(0, 4000));
      const path = c.req.path;
      const method = c.req.method;

      await sql`
        INSERT INTO error_log (message, stack, path, method)
        VALUES (${message}, ${stack}, ${path}, ${method})
      `.catch(() => null);
    }

    return c.json({ error: "internal server error" }, 500);
  });
}
