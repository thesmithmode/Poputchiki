import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import { getClientIp } from "../lib/client-ip";

interface AuthRateLimitOptions {
  ipLimit?: number;
}

export function authRateLimit(sql: postgres.Sql, opts?: AuthRateLimitOptions): MiddlewareHandler {
  const ipLimit = opts?.ipLimit ?? 10;

  return async (c, next) => {
    const ip = getClientIp(c);
    // L2: Math.max(1, ...) — на границе окна (seconds === 60 в редкой race) значение
    // могло быть 0; клиент должен ждать хотя бы 1 секунду. Симметрично с rate-limit.ts.
    const retryAfter = String(Math.max(1, 60 - new Date().getSeconds()));
    const ipKey = `auth:ip:${ip}`;

    const [ipRow] = await sql`
      INSERT INTO rate_limit_buckets (key, window_start, count)
      VALUES (${ipKey}, date_trunc('minute', NOW()), 1)
      ON CONFLICT (key, window_start) DO UPDATE
        SET count = rate_limit_buckets.count + 1
      RETURNING count
    `;

    if ((ipRow?.count ?? 0) > ipLimit) {
      c.header("Retry-After", retryAfter);
      return c.json({ error: "rate limit exceeded" }, 429);
    }

    await next();
    return;
  };
}
