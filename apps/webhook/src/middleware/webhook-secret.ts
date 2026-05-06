import type { MiddlewareHandler } from "hono";

export function webhookSecret(secret: string): MiddlewareHandler {
  return async (c, next) => {
    const header = c.req.header("X-Telegram-Bot-Api-Secret-Token");
    if (header !== secret) {
      return c.json({ error: "forbidden" }, 403);
    }
    return await next();
  };
}
