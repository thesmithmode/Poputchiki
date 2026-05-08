import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrf(allowedOrigin?: string): MiddlewareHandler {
  return async (c, next) => {
    if (!STATE_CHANGING_METHODS.has(c.req.method)) {
      await next();
      return;
    }

    // A3: Origin check — используем URL.origin для точного сравнения (no startsWith bypass)
    if (allowedOrigin) {
      const rawOrigin = c.req.header("Origin") ?? c.req.header("Referer");
      if (!rawOrigin) {
        return c.json({ error: "forbidden: invalid origin" }, 403);
      }
      let parsedOrigin: string;
      try {
        parsedOrigin = new URL(rawOrigin).origin;
      } catch {
        return c.json({ error: "forbidden: invalid origin" }, 403);
      }
      if (parsedOrigin !== allowedOrigin) {
        return c.json({ error: "forbidden: invalid origin" }, 403);
      }
    }

    // Double-submit cookie check
    const headerToken = c.req.header("X-CSRF-Token");
    const cookieToken = getCookie(c, "csrf_token");

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return c.json({ error: "forbidden: csrf token mismatch" }, 403);
    }

    await next();
    return;
  };
}
