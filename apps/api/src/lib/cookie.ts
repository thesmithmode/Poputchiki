import { createHmac, timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "hono/utils/cookie";

const BASE: CookieOptions = {
  sameSite: "None",
  secure: true,
  path: "/",
};

// tg_uid: identity-guard cookie, JS не нужен → HttpOnly (XSS defence)
export const AUTH_COOKIE_DEFAULTS: CookieOptions = {
  ...BASE,
  httpOnly: true,
};

// csrf_token: double-submit pattern требует чтения из JS → НЕ HttpOnly
export const CSRF_COOKIE_DEFAULTS: CookieOptions = {
  ...BASE,
  httpOnly: false,
};

// Backward-compat alias (deprecated, использовать специфичные)
export const COOKIE_DEFAULTS = AUTH_COOKIE_DEFAULTS;

// sess_bind — HMAC(jwtSecret, jti) первые 32 hex-символа.
// Значение не выводится из JWT без знания секрета → украденный JWT без cookie бесполезен.
export function signSessionBinding(secret: string, jti: string): string {
  return createHmac("sha256", secret).update(jti).digest("hex").slice(0, 32);
}

export function verifySessionBinding(secret: string, jti: string, cookie: string): boolean {
  const expected = signSessionBinding(secret, jti);
  if (cookie.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(cookie, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}
