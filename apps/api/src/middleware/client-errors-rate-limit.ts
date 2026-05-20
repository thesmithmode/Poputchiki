import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import { getClientIp } from "../lib/client-ip";

const CLIENT_ERRORS_IP_LIMIT = 5;

/**
 * Dedicated rate-limit для /api/client-errors.
 * Per-IP, 5 req/min, ключ clienterr:ip:<ip>.
 * Не требует авторизации — публичный endpoint, поэтому отдельный bucket.
 */
export function clientErrorsRateLimit(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIp(c);
    // L2: симметрия с rate-limit.ts — на границе окна значение могло быть 0.
    const retryAfter = String(Math.max(1, 60 - new Date().getSeconds()));
    const ipKey = `clienterr:ip:${ip}`;

    const [ipRow] = await sql`
      INSERT INTO rate_limit_buckets (key, window_start, count)
      VALUES (${ipKey}, date_trunc('minute', NOW()), 1)
      ON CONFLICT (key, window_start) DO UPDATE
        SET count = rate_limit_buckets.count + 1
      RETURNING count
    `;

    /* c8 ignore next -- INSERT ... RETURNING always returns a row */
    if ((ipRow?.count ?? 0) > CLIENT_ERRORS_IP_LIMIT) {
      c.header("Retry-After", retryAfter);
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    await next();
    return;
  };
}
