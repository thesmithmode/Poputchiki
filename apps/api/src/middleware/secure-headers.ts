import type { MiddlewareHandler } from "hono";

function buildCsp(domain: string): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://telegram.org https://*.telegram.org",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.telegram.org https://t.me",
    "font-src 'self' data:",
    `connect-src 'self' https://api.${domain} https://*.tile.openstreetmap.org`,
    "frame-ancestors https://web.telegram.org https://*.telegram.org",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export const secureHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  const domain = process.env.DOMAIN ?? "";

  c.res.headers.set("Content-Security-Policy", buildCsp(domain));
  c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("X-Frame-Options", "SAMEORIGIN");
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  c.res.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=()",
  );
};
