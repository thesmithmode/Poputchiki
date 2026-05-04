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
