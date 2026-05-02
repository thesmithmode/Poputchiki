import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { sign } from "hono/jwt";
import type postgres from "postgres";
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
      return c.json({ error: "auth failed" }, 401);
    }

    const { user: tgUser, hash } = verified;

    let userId: string | null = null;
    try {
      userId = await sql.begin(async (tx) => {
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
          RETURNING id
        `;
        const upsertedId = upserted?.id;
        return typeof upsertedId === "string" ? upsertedId : null;
      });
    } catch {
      return c.json({ error: "auth failed" }, 401);
    }

    if (!userId) {
      return c.json({ error: "replay" }, 401);
    }

    const now = Math.floor(Date.now() / 1000);
    const [accessToken, refreshToken] = await Promise.all([
      sign(
        { sub: String(tgUser.id), uid: userId, typ: "access", iat: now, exp: now + ACCESS_TTL },
        jwtSecret,
      ),
      sign(
        { sub: String(tgUser.id), uid: userId, typ: "refresh", iat: now, exp: now + REFRESH_TTL },
        jwtSecret,
      ),
    ]);

    const cookieOpts = { httpOnly: false, sameSite: "None" as const, secure: true, path: "/" };
    setCookie(c, "tg_uid", String(tgUser.id), cookieOpts);
    setCookie(c, "csrf_token", crypto.randomUUID(), cookieOpts);

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: userId, tg_id: tgUser.id },
    });
  });

  return router;
}
