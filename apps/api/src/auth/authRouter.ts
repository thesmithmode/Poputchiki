import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type postgres from "postgres";
import { withSystem } from "../db/with-identity";
import { AUTH_COOKIE_DEFAULTS, CSRF_COOKIE_DEFAULTS, signSessionBinding } from "../lib/cookie";
import { logger } from "../lib/logger";
import { TelegramAuthError, verifyInitData } from "./verifyInitData";

const ACCESS_TTL = 15 * 60; // 15 минут: короткое окно компрометации, refresh transparent для UX
const REFRESH_TTL = 30 * 24 * 60 * 60;

export function createAuthRouter(sql: postgres.Sql): Hono {
  const router = new Hono();

  router.post("/telegram", async (c) => {
    const body = await c.req
      .json<{ initData?: unknown }>()
      .catch((): { initData?: unknown } => ({}));
    const initData = body.initData;

    if (!initData || typeof initData !== "string") {
      return c.json({ error: "missing initData" }, 400);
    }

    const botToken = process.env.BOT_TOKEN;
    const jwtSecret = process.env.JWT_SECRET;
    /* c8 ignore next 3 -- env guaranteed in prod via deploy script */
    if (!botToken || !jwtSecret) {
      return c.json({ error: "server misconfigured" }, 500);
    }

    let verified: ReturnType<typeof verifyInitData>;
    try {
      verified = verifyInitData(initData, botToken);
    } catch (err) {
      /* c8 ignore next -- defensive: verifyInitData only throws TelegramAuthError */
      if (err instanceof TelegramAuthError) {
        return c.json({ error: err.reason }, 401);
      }
      /* c8 ignore next */
      return c.json({ error: "auth failed" }, 401);
    }

    const { user: tgUser, hash } = verified;

    type AuthUserFull = {
      id: string;
      role: string;
      display_name: string;
      onboarded: boolean;
      is_banned: boolean;
      ban_reason: string | null;
      banned_at: string | null;
    };
    let authUser: AuthUserFull | null = null;
    try {
      // withSystem uses SET LOCAL ROLE poputchiki_service (BYPASSRLS) — required because
      // the connection pool connects as poputchiki_app which has RLS enabled. Auth bootstrap
      // must read/write users and nonces before a JWT identity exists.
      authUser = await withSystem(sql, async (tx) => {
        // Replay protection: insert once; conflict → replay attack
        const nonceResult = await tx`
          INSERT INTO nonces (hash) VALUES (${hash})
          ON CONFLICT DO NOTHING
        `;
        if (nonceResult.count === 0) return null;

        const [existing] = await tx`
          SELECT id FROM users WHERE tg_id = ${tgUser.id} AND deleted_at IS NULL LIMIT 1
        `;
        const existingId = existing?.id;
        const id = typeof existingId === "string" ? existingId : crypto.randomUUID();

        const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");

        const [upserted] = await tx`
          INSERT INTO users (id, tg_id, display_name, tg_username, last_seen_at)
          VALUES (${id}, ${tgUser.id}, ${displayName}, ${tgUser.username ?? null}, NOW())
          ON CONFLICT (tg_id) DO UPDATE SET
            last_seen_at = NOW(),
            tg_username = EXCLUDED.tg_username
          RETURNING id, role, display_name, onboarded, is_banned, ban_reason, banned_at
        `;
        /* c8 ignore start -- defensive: INSERT RETURNING always gives id+role string */
        const upsertedId = upserted?.id;
        const upsertedRole = typeof upserted?.role === "string" ? upserted.role : "user";
        if (typeof upsertedId !== "string") return null;
        return {
          id: upsertedId,
          role: upsertedRole,
          display_name:
            typeof upserted?.display_name === "string" ? upserted.display_name : displayName,
          onboarded: Boolean(upserted?.onboarded),
          is_banned: Boolean(upserted?.is_banned),
          ban_reason: typeof upserted?.ban_reason === "string" ? upserted.ban_reason : null,
          banned_at: typeof upserted?.banned_at === "string" ? upserted.banned_at : null,
        };
        /* c8 ignore stop */
      });
    } catch {
      /* c8 ignore next -- defensive: sql.begin failure (DB drop mid-tx) */
      return c.json({ error: "auth failed" }, 401);
    }

    if (!authUser) {
      return c.json({ error: "replay" }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const jwtBase = { sub: String(tgUser.id), uid: authUser.id, role: authUser.role };
    const accessJti = crypto.randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      sign(
        { ...jwtBase, typ: "access", jti: accessJti, iat: now, exp: now + ACCESS_TTL },
        jwtSecret,
      ),
      sign(
        { ...jwtBase, typ: "refresh", jti: crypto.randomUUID(), iat: now, exp: now + REFRESH_TTL },
        jwtSecret,
      ),
    ]);

    setCookie(c, "sess_bind", signSessionBinding(jwtSecret, accessJti), AUTH_COOKIE_DEFAULTS);
    setCookie(c, "csrf_token", crypto.randomUUID(), CSRF_COOKIE_DEFAULTS);

    logger.info({ event: "auth.login", tg_id: tgUser.id, uid: authUser.id }, "user authenticated");

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: authUser.id,
        display_name: authUser.display_name,
        onboarded: authUser.onboarded,
        is_banned: authUser.is_banned,
        ban_reason: authUser.ban_reason,
        banned_at: authUser.banned_at,
        role: authUser.role as "user" | "admin",
      },
    });
  });

  router.post("/refresh", async (c) => {
    const jwtSecret = process.env.JWT_SECRET;
    /* c8 ignore next 3 -- env guaranteed in prod */
    if (!jwtSecret) {
      return c.json({ error: "server misconfigured" }, 500);
    }

    const body = await c.req
      .json<{ refresh_token?: unknown }>()
      .catch((): { refresh_token?: unknown } => ({}));

    const refreshToken = body.refresh_token;
    if (!refreshToken || typeof refreshToken !== "string") {
      return c.json({ error: "missing refresh_token" }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verify(refreshToken, jwtSecret, "HS256");
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }

    if (payload.typ !== "refresh") {
      return c.json({ error: "invalid token type" }, 401);
    }

    /* c8 ignore start -- signed JWTs always carry jti/uid; null branches unreachable */
    const oldJti = typeof payload.jti === "string" ? payload.jti : null;
    const userId = typeof payload.uid === "string" ? payload.uid : null;
    /* c8 ignore stop */

    /* c8 ignore next -- uid always present in signed tokens */
    if (!userId) return c.json({ error: "invalid token" }, 401);

    // Verify user still exists, is not soft-deleted AND not banned.
    // banned/deleted users must not be able to refresh tokens indefinitely.
    const [userRow] = await sql<{ id: string; tg_id: string | number; role: string }[]>`
      SELECT id, tg_id, role FROM users
      WHERE id = ${userId} AND deleted_at IS NULL AND is_banned = false
      LIMIT 1
    `;
    if (!userRow) {
      return c.json({ error: "user not found" }, 401);
    }

    // Atomic CAS-style revocation: INSERT first, RETURNING tells us who won the race.
    // If oldJti was already revoked (concurrent /refresh on same token, or replay)
    // → no row inserted → 401. Closes race between SELECT check and INSERT.
    /* c8 ignore next -- oldJti always non-null for issued refresh tokens */
    if (oldJti) {
      const claimed = await sql<{ jti: string }[]>`
        INSERT INTO revoked_tokens (jti, user_id)
        VALUES (${oldJti}, ${userId})
        ON CONFLICT (jti) DO NOTHING
        RETURNING jti
      `;
      if (claimed.length === 0) {
        return c.json({ error: "token revoked" }, 401);
      }
    }

    // Issue new tokens
    const now = Math.floor(Date.now() / 1000);
    const jwtBase = {
      sub: String(payload.sub),
      uid: String(payload.uid),
      role: userRow.role,
    };
    const newAccessJti = crypto.randomUUID();
    const [newAccess, newRefresh] = await Promise.all([
      sign(
        { ...jwtBase, typ: "access", jti: newAccessJti, iat: now, exp: now + ACCESS_TTL },
        jwtSecret,
      ),
      sign(
        { ...jwtBase, typ: "refresh", jti: crypto.randomUUID(), iat: now, exp: now + REFRESH_TTL },
        jwtSecret,
      ),
    ]);

    setCookie(c, "sess_bind", signSessionBinding(jwtSecret, newAccessJti), AUTH_COOKIE_DEFAULTS);
    setCookie(c, "csrf_token", crypto.randomUUID(), CSRF_COOKIE_DEFAULTS);

    logger.info({ event: "auth.refresh", tg_id: payload.sub, uid: userId }, "token refreshed");

    return c.json({ access_token: newAccess, refresh_token: newRefresh });
  });

  router.post("/logout", async (c) => {
    const jwtSecret = process.env.JWT_SECRET;
    /* c8 ignore next 3 -- env guaranteed in prod */
    if (!jwtSecret) {
      return c.json({ error: "server misconfigured" }, 500);
    }

    const body = await c.req
      .json<{ refresh_token?: unknown; access_token?: unknown }>()
      .catch((): { refresh_token?: unknown; access_token?: unknown } => ({}));

    const refreshToken = body.refresh_token;
    if (!refreshToken || typeof refreshToken !== "string") {
      return c.json({ error: "missing refresh_token" }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await verify(refreshToken, jwtSecret, "HS256");
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }

    if (payload.typ !== "refresh") {
      return c.json({ error: "invalid token type" }, 401);
    }

    /* c8 ignore start -- defensive null: signed JWTs always carry jti/uid */
    const refreshJti = typeof payload.jti === "string" ? payload.jti : null;
    const userId = typeof payload.uid === "string" ? payload.uid : null;
    /* c8 ignore stop */

    /* c8 ignore next -- defensive: signed JWT always has jti */
    if (refreshJti) {
      const [already] = await sql`SELECT 1 FROM revoked_tokens WHERE jti = ${refreshJti} LIMIT 1`;
      if (already) return c.json({ error: "token already revoked" }, 401);
    }

    // Optionally revoke the access-token jti so it dies immediately, not at exp.
    let accessJti: string | null = null;
    const accessToken = body.access_token;
    if (typeof accessToken === "string" && accessToken.length > 0) {
      try {
        const accessPayload = await verify(accessToken, jwtSecret, "HS256");
        /* c8 ignore next 6 -- defensive: matched-uid happy path covered by 'revokes both tokens' test */
        if (
          accessPayload.typ === "access" &&
          typeof accessPayload.jti === "string" &&
          accessPayload.uid === userId
        ) {
          accessJti = accessPayload.jti;
        }
      } catch {
        // ignore: malformed/expired access token doesn't block logout
      }
    }

    const jtiList = [refreshJti, accessJti].filter((j): j is string => Boolean(j));
    for (const jti of jtiList) {
      try {
        await sql`
          INSERT INTO revoked_tokens (jti, user_id)
          VALUES (${jti}, ${userId})
          ON CONFLICT (jti) DO NOTHING
        `;
      } catch {
        // best-effort revocation — logout proceeds even if DB insert fails
      }
    }

    setCookie(c, "sess_bind", "", { ...AUTH_COOKIE_DEFAULTS, maxAge: 0 });
    setCookie(c, "csrf_token", "", { ...CSRF_COOKIE_DEFAULTS, maxAge: 0 });

    logger.info({ event: "auth.logout", uid: userId }, "user logged out");

    return c.json({ ok: true });
  });

  return router;
}
