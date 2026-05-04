import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_DEFAULTS,
  COOKIE_DEFAULTS,
  CSRF_COOKIE_DEFAULTS,
} from "../../../src/lib/cookie";

describe("COOKIE_DEFAULTS sentinel", () => {
  it("sameSite is 'None'", () => {
    expect(COOKIE_DEFAULTS.sameSite).toBe("None");
  });

  it("SENTINEL: sameSite is NOT 'Lax'", () => {
    expect(COOKIE_DEFAULTS.sameSite).not.toBe("Lax");
    expect(COOKIE_DEFAULTS.sameSite).not.toBe("Strict");
  });

  it("secure is true", () => {
    expect(COOKIE_DEFAULTS.secure).toBe(true);
  });

  it("path is '/'", () => {
    expect(COOKIE_DEFAULTS.path).toBe("/");
  });

  it("Set-Cookie header rendered by Hono includes SameSite=None and Secure", async () => {
    const app = new Hono();
    app.get("/test", (c) => {
      setCookie(c, "tg_uid", "12345", COOKIE_DEFAULTS);
      setCookie(c, "csrf_token", "token-abc", COOKIE_DEFAULTS);
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    const cookies = res.headers.getSetCookie();

    const tgCookie = cookies.find((k: string) => k.startsWith("tg_uid="));
    const csrfCookie = cookies.find((k: string) => k.startsWith("csrf_token="));

    expect(tgCookie).toBeTruthy();
    expect(tgCookie).toContain("SameSite=None");
    expect(tgCookie).toContain("Secure");

    expect(csrfCookie).toBeTruthy();
    expect(csrfCookie).toContain("SameSite=None");
    expect(csrfCookie).toContain("Secure");
  });

  it("SENTINEL: AUTH cookies are HttpOnly (XSS defence for tg_uid)", () => {
    expect(AUTH_COOKIE_DEFAULTS.httpOnly).toBe(true);
  });

  it("SENTINEL: CSRF cookie is NOT HttpOnly (double-submit needs JS read)", () => {
    expect(CSRF_COOKIE_DEFAULTS.httpOnly).toBe(false);
  });

  it("SENTINEL: rendered tg_uid cookie has HttpOnly flag", async () => {
    const app = new Hono();
    app.get("/test", (c) => {
      setCookie(c, "tg_uid", "12345", AUTH_COOKIE_DEFAULTS);
      setCookie(c, "csrf_token", "token-abc", CSRF_COOKIE_DEFAULTS);
      return c.json({ ok: true });
    });
    const res = await app.request("/test");
    const cookies = res.headers.getSetCookie();
    const tg = cookies.find((k: string) => k.startsWith("tg_uid=")) ?? "";
    const csrf = cookies.find((k: string) => k.startsWith("csrf_token=")) ?? "";
    expect(/HttpOnly/i.test(tg)).toBe(true);
    expect(/HttpOnly/i.test(csrf)).toBe(false);
  });

  it("SENTINEL: Set-Cookie does NOT use SameSite=Lax", async () => {
    const app = new Hono();
    app.get("/test", (c) => {
      setCookie(c, "tg_uid", "12345", COOKIE_DEFAULTS);
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    const cookies = res.headers.getSetCookie();

    for (const cookie of cookies) {
      expect(cookie).not.toContain("SameSite=Lax");
      expect(cookie).not.toContain("SameSite=Strict");
    }
  });
});
