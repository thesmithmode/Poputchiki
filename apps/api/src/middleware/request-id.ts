import type { MiddlewareHandler } from "hono";
import { logger } from "../lib/logger";

export function requestId(): MiddlewareHandler {
  return async (c, next) => {
    const incoming = c.req.header("X-Request-ID");
    const id = incoming ?? crypto.randomUUID();
    c.set("requestId" as never, id);
    c.set("logger" as never, logger.child({ requestId: id }));
    await next();
    c.header("X-Request-ID", id);
  };
}
