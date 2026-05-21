import type { MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import type postgres from "postgres";
import { verifySessionBinding } from "../lib/cookie";

export type AppUser = { id: string; tgId: number; role: string; displayName?: string };

export function identityGuard(jwtSecret: string, sql?: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const sessBindCookie = getCookie(c, "sess_bind");

    if (!authHeader || !sessBindCookie) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    let payload: Record<string, unknown>;
    try {
      payload = await verify(token, jwtSecret, "HS256");
    } catch {
      return c.json({ error: "unauthorized" }, 401);
    }

    if (payload.typ !== "access") {
      return c.json({ error: "unauthorized" }, 401);
    }

    // jti обязателен — все выданные access-токены содержат jti
    const jti = typeof payload.jti === "string" ? payload.jti : null;
    if (!jti) {
      return c.json({ error: "unauthorized" }, 401);
    }

    // sess_bind = HMAC(jwtSecret, jti): знание JWT не позволяет вычислить cookie без секрета
    if (!verifySessionBinding(jwtSecret, jti, sessBindCookie)) {
      setCookie(c, "sess_bind", "", { maxAge: 0, path: "/" });
      return c.json({ error: "unauthorized" }, 401);
    }

    // Проверка отозванности jti
    let displayName: string | undefined;
    if (sql) {
      const [revoked] = await sql`
        SELECT 1 FROM revoked_tokens WHERE jti = ${jti} LIMIT 1
      `;
      if (revoked) {
        return c.json({ error: "unauthorized" }, 401);
      }

      const userId = String(payload.uid);
      const [userRow] = await sql<{ display_name: string }[]>`
        SELECT display_name FROM users WHERE id = ${userId}::uuid LIMIT 1
      `;
      displayName = userRow?.display_name;
    }

    const user: AppUser = {
      id: String(payload.uid),
      tgId: Number(payload.sub),
      role: String(payload.role ?? "user"),
      ...(displayName !== undefined && { displayName }),
    };

    c.set("user" as never, user);
    await next();
    return;
  };
}
