import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export function webhookSecret(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("X-Telegram-Bot-Api-Secret-Token");
    if (!header) {
      return c.json({ error: "forbidden" }, 401);
    }

    // A4: timingSafeEqual — сначала проверяем длину (разные длины → 401 без сравнения)
    const headerBuf = Buffer.from(header, "utf8");
    const secretBuf = Buffer.from(secret, "utf8");
    if (headerBuf.length !== secretBuf.length || !timingSafeEqual(headerBuf, secretBuf)) {
      return c.json({ error: "forbidden" }, 401);
    }

    return await next();
  };
}
