import type { MiddlewareHandler } from "hono";

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key, X-CSRF-Token, X-Request-ID";

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowedOrigin = `https://app.${process.env.DOMAIN ?? ""}`;
  const allowed = origin !== "" && origin === allowedOrigin;

  if (c.req.method === "OPTIONS") {
    if (allowed) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
      c.header("Access-Control-Allow-Methods", ALLOWED_METHODS);
      c.header("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    }
    return c.body(null, 204);
  }

  await next();

  if (allowed) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
  }
  return;
};
