import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import type { AppUser } from "./identity-guard";

export function bannedUser(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    // Allow GET /api/users/me through — user needs to see their ban reason
    if (c.req.path === "/api/users/me" && c.req.method === "GET") {
      await next();
      return;
    }
    const user = c.get("user" as never) as AppUser;
    if (!user) {
      await next();
      return;
    }

    const [row] = await sql<
      { is_banned: boolean; ban_reason: string | null; banned_at: string | null }[]
    >`
      SELECT is_banned, ban_reason, banned_at FROM users WHERE id = ${user.id} LIMIT 1
    `;
    if (row?.is_banned) {
      return c.json({ error: "banned", reason: row.ban_reason, banned_at: row.banned_at }, 403);
    }
    await next();
    return;
  };
}
