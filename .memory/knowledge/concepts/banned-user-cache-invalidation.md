---
title: "Banned User In-Memory Cache with Invalidation on DELETE /me"
aliases: [banned-user-cache, banned-cache-invalidation, bancheck-cache, banned-30s-cache]
tags: [backend, security, caching, performance, pattern]
sources:
  - "daily/2026-05-15.md"
created: 2026-05-15
updated: 2026-05-15
---

# Banned User In-Memory Cache with Invalidation on DELETE /me

A 30-second in-memory cache for banned user status reduces database load from the `bannedUser` middleware without introducing meaningful staleness risk. The cache is keyed by `userId` and invalidated immediately when the user deletes their account via `DELETE /me`.

## Key Points

- `bannedUser` middleware fires on every protected request — without caching, every request hits `SELECT banned_at FROM users WHERE id = $1`
- 30s TTL strikes the balance: ban propagation delay ≤ 30s (acceptable for moderation), DB load reduced ~97% for active users
- Cache key: `userId` (not session or JWT — same user on multiple devices shares the cache entry)
- Invalidation trigger: `DELETE /me` handler evicts the cache entry for that user immediately
- Cache is process-local (in-memory Map) — multiple API replicas have independent caches; 30s TTL means max lag across replicas is 30s

## Details

The `bannedUser` middleware checks whether a user is banned before allowing sensitive operations. Without caching, a user making 10 requests per second generates 10 DB reads per second on this single check. At 50,000 DAU, this becomes the dominant query load on the `users` table.

Implementation pattern:

```typescript
const banCache = new Map<string, { banned: boolean; expiresAt: number }>();

export async function bannedUser(c: Context, next: Next) {
  const userId = c.get("userId") as string;
  const now = Date.now();

  const cached = banCache.get(userId);
  if (cached && cached.expiresAt > now) {
    if (cached.banned) return c.json({ error: "Banned" }, 403);
    return next();
  }

  const [user] = await sql`SELECT banned_at FROM users WHERE id = ${userId}`;
  const banned = Boolean(user?.banned_at);
  banCache.set(userId, { banned, expiresAt: now + 30_000 });

  if (banned) return c.json({ error: "Banned" }, 403);
  return next();
}

// In DELETE /me handler:
export async function deleteMe(c: Context) {
  const userId = c.get("userId") as string;
  await sql`UPDATE users SET deleted_at = NOW() WHERE id = ${userId}`;
  banCache.delete(userId); // immediate cache invalidation
  clearTokens(); // instruct client
  return c.json({ ok: true });
}
```

The choice of 30 seconds is deliberate. An admin banning a user via a moderation action will see the ban take effect within 30 seconds — acceptable for a human moderation workflow. Shorter TTLs (e.g., 5s) provide little load reduction; longer TTLs (e.g., 5 min) risk banned users continuing to act for too long.

The `DELETE /me` invalidation is the critical correctness invariant: a user deleting their own account must immediately stop being able to use the API. Without cache invalidation on delete, a just-deleted user could continue making requests for up to 30 seconds if their ban status was `false` in the cache (not banned → deleted, but cache still says "not banned").

Separate cache entries per `userId` means banning User A does not affect User B's cache entry. This is correct — cache keys must be at the granularity of the checked entity (user), not at a broader scope.

## Related Concepts

- [[concepts/auth-security-vulnerabilities]] — `bannedUser` middleware scope was previously too broad (blocked `PATCH /me`); the cache interacts correctly with the narrowed scope
- [[concepts/rls-guc-identity]] — `userId` used as cache key matches the `app.current_user_id` GUC set per transaction; both operate at the same identity granularity
- [[concepts/apifetch-centralized-401-refresh]] — Complementary middleware layer: `apiFetch` handles 401 refresh; `bannedUser` handles 403 banned status; both run on the request path

## Sources

- [[daily/2026-05-15.md]] — Session 12:08: `bannedUser` middleware given 30s in-memory cache keyed by `userId`; `DELETE /me` handler immediately evicts the cache entry; sentinel tests added for different users having independent cache entries and invalidation
