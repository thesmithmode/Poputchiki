import type { CookieOptions } from "hono/utils/cookie";

export const COOKIE_DEFAULTS: CookieOptions = {
  httpOnly: false,
  sameSite: "None",
  secure: true,
  path: "/",
};
