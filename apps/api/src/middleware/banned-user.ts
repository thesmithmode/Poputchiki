import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import type { AppUser } from "./identity-guard";

interface UserState {
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  deleted_at: string | null;
}

// In-memory TTL cache: при 50k DAU и 100 req/min/user без кэша = 5M SELECT users/min.
// 30s TTL означает что ban / self-delete активируются с лагом до 30s — приемлемо
// потому что /auth/refresh всё равно проверяет user state на свежем запросе (без кэша).
// Принудительная инвалидация (admin ban через API) — invalidateUserState(userId).
const TTL_MS = 30_000;
const MAX_ENTRIES = 50_000;
const cache = new Map<string, { state: UserState | null; expires: number }>();

export function invalidateUserState(userId: string): void {
  cache.delete(userId);
}

/* c8 ignore start -- test-only utility */
export function _resetUserStateCache(): void {
  cache.clear();
}
/* c8 ignore stop */

async function getUserState(sql: postgres.Sql, userId: string): Promise<UserState | null> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.state;

  const [row] = await sql<UserState[]>`
    SELECT is_banned, ban_reason, banned_at, deleted_at FROM users WHERE id = ${userId} LIMIT 1
  `;
  const state = row ?? null;

  /* c8 ignore start -- defensive eviction; не покрываем тестом 50k entries */
  if (cache.size >= MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  /* c8 ignore stop */
  cache.set(userId, { state, expires: now + TTL_MS });
  return state;
}

export function bannedUser(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    const user = c.get("user" as never) as AppUser;
    if (!user) {
      await next();
      return;
    }

    const row = await getUserState(sql, user.id);

    // Deleted (anonymized) user → 401, no access at all, even to /api/users/me
    if (row?.deleted_at) {
      return c.json({ error: "unauthorized" }, 401);
    }

    // /api/users/me — banned user needs to see their ban reason
    if (c.req.path === "/api/users/me") {
      await next();
      return;
    }

    if (row?.is_banned) {
      return c.json({ error: "banned", reason: row.ban_reason, banned_at: row.banned_at }, 403);
    }
    await next();
    return;
  };
}
