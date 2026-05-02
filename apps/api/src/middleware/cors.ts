import type { MiddlewareHandler } from "hono";

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key, X-CSRF-Token, X-Request-ID";

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowedOrigin = `https://app.${process.env.DOMAIN ?? ""}`;
  const allowed = origin !== "" && origin === allowedOrigin;

  if (c.req.method === "OPTIONS") {
    const res = new Response(null, { status: 204 });
    if (allowed) {
      res.headers.set("Access-Control-Allow-Origin", origin);
      res.headers.set("Access-Control-Allow-Credentials", "true");
      res.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
      res.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
    }
    return res;
  }

  await next();

  if (allowed) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Allow-Credentials", "true");
  }
};
