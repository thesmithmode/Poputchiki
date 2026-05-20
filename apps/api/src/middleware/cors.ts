import type { MiddlewareHandler } from "hono";
import { logger } from "../lib/logger";

const ALLOWED_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Idempotency-Key, X-CSRF-Token, X-Request-ID";

// Fail-fast: если DOMAIN не задан, allowedOrigin = "https://app." — ни один origin не совпадёт,
// весь frontend будет заблокирован CORS без единого сообщения в логах сервера.
// Броски ошибки при module load обнаруживаются сразу при старте контейнера.
const _domain = process.env.DOMAIN;
if (!_domain) {
  // В тестах DOMAIN может отсутствовать при импорте — не бросаем, только warn.
  // Production: parseApiEnv в packages/shared уже бросает при NODE_ENV=production.
  // Дополнительный runtime guard ниже покрывает case когда parseApiEnv обойдён.
  if (process.env.NODE_ENV === "production") {
    logger.error(
      { event: "cors_domain_missing" },
      "DOMAIN env var not set — CORS will block all frontend requests",
    );
  }
}

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const domain = process.env.DOMAIN;
  if (!domain && process.env.NODE_ENV === "production") {
    return c.json({ error: "server misconfigured: DOMAIN not set" }, 500);
  }
  const origin = c.req.header("origin") ?? "";
  const allowedOrigin = `https://app.${domain ?? ""}`;
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
