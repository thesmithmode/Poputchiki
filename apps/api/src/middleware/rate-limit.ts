import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import { getClientIp } from "../lib/client-ip";
import type { AppUser } from "./identity-guard";

interface RateLimitOptions {
  userLimit?: number;
  ipLimit?: number;
}

export function rateLimit(sql: postgres.Sql, opts?: RateLimitOptions): MiddlewareHandler {
  const userLimit = opts?.userLimit ?? 100;
  const ipLimit = opts?.ipLimit ?? 1000;

  return async (c, next) => {
    const ip = getClientIp(c);

    const retryAfter = String(60 - new Date().getSeconds());

    const ipKey = `ip:${ip}`;
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

    const user = c.get("user" as never) as AppUser | undefined;
    if (user?.id) {
      const userKey = `user:${user.id}`;
      const [userRow] = await sql`
        INSERT INTO rate_limit_buckets (key, window_start, count)
        VALUES (${userKey}, date_trunc('minute', NOW()), 1)
        ON CONFLICT (key, window_start) DO UPDATE
          SET count = rate_limit_buckets.count + 1
        RETURNING count
      `;

      if ((userRow?.count ?? 0) > userLimit) {
        c.header("Retry-After", retryAfter);
        return c.json({ error: "rate limit exceeded" }, 429);
      }
    }

    await next();
    return;
  };
}
