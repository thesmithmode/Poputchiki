---
name: JWT Refresh Race Condition
description: Concurrent 401 responses all trigger refresh simultaneously — multiple valid refresh tokens created, rotation guarantee violated
type: concept
tags: [auth, jwt, race-condition, security, backend]
created: 2026-05-20
updated: 2026-05-20
compiled_from: daily/2026-05-20.md (sector-api-backend review, api-C1)
---

# JWT Refresh Race Condition

## Problem

When multiple parallel API requests return 401, every concurrent 401 handler calls `/auth/refresh` simultaneously. Each call succeeds because the old token is still valid until the first rotation commits. Result: multiple valid refresh tokens exist in the DB at the same time — token rotation guarantee is broken.

## Why It Matters

Token rotation is a security control: each refresh token can only be used once, and using it invalidates all siblings. If N concurrent requests each get a fresh refresh token, an attacker who stole the original token can still use one of the N fresh tokens (they haven't been rotated yet). The invariant "one valid refresh token per session" collapses.

At 50k users with SSE + polling, concurrent 401 bursts are the norm, not the edge case.

## Root Cause

No in-flight deduplication on the client side. `apiFetch` or the 401 interceptor calls `/auth/refresh` once per failing request, not once per session. The backend's rotation check uses a read-then-write pattern without a row lock, so multiple concurrent callers each pass the "is token valid?" check before any commits the rotation.

## Fix

Client side: use a single shared refresh promise. First caller creates `refreshPromise`; subsequent callers await the same promise, not a new one. After resolve, all retry with the new token.

```typescript
let refreshPromise: Promise<string> | null = null;

async function refreshOnce(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}
```

Server side: use `SELECT ... FOR UPDATE` or advisory lock on the refresh token row to serialize concurrent rotation attempts.

## Affected Files

- `apps/api/src/` — 401 interceptor / apiFetch wrapper
- `apps/api/src/routes/auth.ts` — `/auth/refresh` handler

## Related

- [[concepts/sess-bind-jwt-session-fixation]] — session fixation via cookie binding
- [[concepts/apifetch-centralized-401-refresh]] — centralized refresh architecture
