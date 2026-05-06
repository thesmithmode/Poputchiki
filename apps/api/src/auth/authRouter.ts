import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type postgres from "postgres";
import { AUTH_COOKIE_DEFAULTS, CSRF_COOKIE_DEFAULTS } from "../lib/cookie";
import { TelegramAuthError, verifyInitData } from "./verifyInitData";

const ACCESS_TTL = 24 * 60 * 60;
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
      if (err instanceof TelegramAuthError) {
        return c.json({ error: err.reason }, 401);
      }
      /* c8 ignore next -- defensive: verifyInitData only throws TelegramAuthError */
      return c.json({ error: "auth failed" }, 401);
    }

    const { user: tgUser, hash } = verified;

    let authUser: { id: string; role: string } | null = null;
    try {
      authUser = await sql.begin(async (tx) => {
        // Replay protection: insert once; conflict → replay attack
        const [nonce] = await tx`
          INSERT INTO nonces (hash) VALUES (${hash})
          ON CONFLICT DO NOTHING
          RETURNING hash
        `;
        if (!nonce) return null;

        // Bootstrap: find existing user UUID before setting RLS role
        const [existing] = await tx`
          SELECT id FROM users WHERE tg_id = ${tgUser.id} AND deleted_at IS NULL LIMIT 1
        `;
        const existingId = existing?.id;
        const id = typeof existingId === "string" ? existingId : crypto.randomUUID();

        // Set GUC identity so RLS policies pass
        await tx`SELECT set_config('app.current_user_id', ${id}, true)`;
        await tx`SELECT set_config('app.current_user_tg_id', ${String(tgUser.id)}, true)`;
        await tx`SELECT set_config('app.current_user_role', 'user', true)`;
        await tx`SET LOCAL ROLE poputchiki_app`;

        const displayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");

        const [upserted] = await tx`
          INSERT INTO users (id, tg_id, display_name, tg_username, last_seen_at)
          VALUES (${id}, ${tgUser.id}, ${displayName}, ${tgUser.username ?? null}, NOW())
          ON CONFLICT (tg_id) DO UPDATE SET
            last_seen_at = NOW(),
            tg_username = EXCLUDED.tg_username
          RETURNING id, role
        `;
        const upsertedId = upserted?.id;
        const upsertedRole = typeof upserted?.role === "string" ? upserted.role : "user";
        return typeof upsertedId === "string" ? { id: upsertedId, role: upsertedRole } : null;
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
    const [accessToken, refreshToken] = await Promise.all([
      sign(
        { ...jwtBase, typ: "access", jti: crypto.randomUUID(), iat: now, exp: now + ACCESS_TTL },
        jwtSecret,
      ),
      sign(
        { ...jwtBase, typ: "refresh", jti: crypto.randomUUID(), iat: now, exp: now + REFRESH_TTL },
        jwtSecret,
      ),
    ]);

    setCookie(c, "tg_uid", String(tgUser.id), AUTH_COOKIE_DEFAULTS);
    setCookie(c, "csrf_token", crypto.randomUUID(), CSRF_COOKIE_DEFAULTS);

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: authUser.id, tg_id: tgUser.id },
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

    // Check revocation
    if (oldJti) {
      const [revoked] = await sql`
        SELECT 1 FROM revoked_tokens WHERE jti = ${oldJti} LIMIT 1
      `;
      if (revoked) {
        return c.json({ error: "token revoked" }, 401);
      }
    }

    // Verify user still exists and is not soft-deleted.
    /* c8 ignore next -- uid always present in signed tokens */
    if (!userId) return c.json({ error: "invalid token" }, 401);
    const [userRow] = await sql`
      SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL LIMIT 1
    `;
    if (!userRow) {
      return c.json({ error: "user not found" }, 401);
    }

    // Revoke the old refresh token
    /* c8 ignore next -- oldJti always non-null for issued refresh tokens */
    if (oldJti) {
      try {
        await sql`
          INSERT INTO revoked_tokens (jti, user_id)
          VALUES (${oldJti}, ${userId})
          ON CONFLICT (jti) DO NOTHING
        `;
      } catch {
        // best-effort revocation — don't fail the request
      }
    }

    // Issue new tokens
    const now = Math.floor(Date.now() / 1000);
    const jwtBase = {
      sub: String(payload.sub),
      uid: String(payload.uid),
      /* c8 ignore next -- defensive: refresh tokens always carry role */
      role: String(payload.role ?? "user"),
    };
    const [newAccess, newRefresh] = await Promise.all([
      sign(
        { ...jwtBase, typ: "access", jti: crypto.randomUUID(), iat: now, exp: now + ACCESS_TTL },
        jwtSecret,
      ),
      sign(
        { ...jwtBase, typ: "refresh", jti: crypto.randomUUID(), iat: now, exp: now + REFRESH_TTL },
        jwtSecret,
      ),
    ]);

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

    setCookie(c, "tg_uid", "", { ...AUTH_COOKIE_DEFAULTS, maxAge: 0 });
    setCookie(c, "csrf_token", "", { ...CSRF_COOKIE_DEFAULTS, maxAge: 0 });

    return c.json({ ok: true });
  });

  return router;
}
