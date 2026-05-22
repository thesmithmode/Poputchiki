import type { MiddlewareHandler } from "hono";
import type postgres from "postgres";
import type { AppUser } from "./identity-guard";

interface CachedResponse {
  status_code: number;
  body: unknown;
  _pending?: boolean;
}

const PENDING_SENTINEL = { _pending: true } as const;

/**
 * Idempotency middleware. Race-safe via INSERT-first sentinel pattern:
 * 1. Atomic INSERT of `_pending` placeholder ON CONFLICT DO NOTHING.
 * 2. If insert won the race → run handler, then UPDATE row with real response.
 * 3. If insert lost → SELECT existing; if still `_pending` → 409 (in-flight),
 *    else return cached body/status.
 *
 * The simple SELECT-then-INSERT pattern allows two concurrent POSTs with the
 * same key to both run business logic, violating idempotency.
 */
export function idempotency(sql: postgres.Sql): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return;
    }

    const key = c.req.header("Idempotency-Key");
    if (!key) {
      await next();
      return;
    }

    const user = c.get("user" as never) as AppUser | undefined;
    const userId: string | null = user?.id ?? null;

    // Try to claim the key atomically. RETURNING tells us who won the race.
    let won = false;
    try {
      const inserted = await sql<{ key: string }[]>`
        INSERT INTO idempotency_keys (key, user_id, response)
        VALUES (${key}, ${userId}::uuid, ${sql.json(PENDING_SENTINEL)}::jsonb)
        ON CONFLICT (key, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING
        RETURNING key
      `;
      won = inserted.length > 0;
    } catch {
      // DB error during claim — treat as if no key was provided to avoid blocking
      await next();
      return;
    }

    if (!won) {
      // Lost the race or repeat request.
      const rows = await sql<{ response: CachedResponse }[]>`
        SELECT response FROM idempotency_keys
        WHERE key = ${key}
          AND user_id IS NOT DISTINCT FROM ${userId}::uuid
          AND created_at > NOW() - INTERVAL '24 hours'
      `;
      const cached = rows[0]?.response;
      if (!cached) {
        // Stale (>24h expired) — refuse to replay
        return c.json({ error: "idempotency_key_expired" }, 409);
      }
      if (cached._pending) {
        return c.json({ error: "idempotency_key_in_progress" }, 409);
      }
      return c.json(cached.body, cached.status_code as 200);
    }

    // We own the key — run the handler.
    try {
      await next();
    } catch (err) {
      // Handler threw — release the sentinel so client can retry.
      await sql`DELETE FROM idempotency_keys WHERE key = ${key} AND user_id IS NOT DISTINCT FROM ${userId}::uuid`.catch(
        () => {},
      );
      throw err;
    }

    const status = c.res.status;
    if (status < 200 || status >= 300) {
      // Non-2xx — release the sentinel so client can retry with the same key.
      await sql`DELETE FROM idempotency_keys WHERE key = ${key} AND user_id IS NOT DISTINCT FROM ${userId}::uuid`.catch(
        () => {},
      );
      return;
    }

    let body: unknown = null;
    try {
      body = await c.res.clone().json();
    } catch {
      // non-JSON response body — store null
    }

    const payload: CachedResponse = { status_code: status, body };

    try {
      await sql`
        UPDATE idempotency_keys
        SET response = ${sql.json(payload as never)}::jsonb
        WHERE key = ${key}
          AND user_id IS NOT DISTINCT FROM ${userId}::uuid
      `;
    } catch {
      // Best-effort persistence — sentinel will linger; subsequent requests get 409 until 24h.
    }
    return;
  };
}
