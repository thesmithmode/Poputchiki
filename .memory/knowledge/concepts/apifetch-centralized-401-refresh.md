---
title: "Centralized 401 Refresh in apiFetch Utility"
aliases: [apifetch-401, centralized-refresh, 401-retry-apifetch, useMe-refresh-migration]
tags: [frontend, authentication, react, pattern, refactoring]
sources:
  - "daily/2026-05-15.md"
created: 2026-05-15
updated: 2026-05-15
---

# Centralized 401 Refresh in apiFetch Utility

Moving 401-retry logic from individual hooks (e.g., `useMe`) into the shared `apiFetch` utility eliminates duplicated refresh code across all API call sites. Every hook gets automatic token refresh and retry without implementing it individually.

## Key Points

- Initial placement: 401 refresh was inside `useMe` → only `useMe` calls benefited; all other hooks made bare fetch calls with no retry
- Correct placement: `apiFetch` utility intercepts 401, attempts `/auth/refresh`, retries the original request once
- Hooks that call `apiFetch` (ride listing, profile updates, notifications) get automatic refresh for free
- On refresh failure (refresh token expired): `clearTokens()` and let the caller handle the unauthenticated state
- `useMe` specifically must NOT re-trigger `telegramAuth()` on 401 — `initData` expires; refresh is the only correct path

## Details

The duplication problem: `useMe` implemented a 401→refresh→retry flow because it was the first hook written. When subsequent hooks (`useRides`, `useProfile`, etc.) were added, each made raw `apiFetch` calls without the retry logic. Any 401 on those endpoints silently failed — the user saw an error instead of a transparent token refresh.

Centralizing in `apiFetch`:

```typescript
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const fullPath = path.startsWith("/auth/") ? path : `/api${path}`;
  const url = `${import.meta.env.VITE_API_BASE}${fullPath}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    const refreshed = await tryRefreshTokens(); // POST /auth/refresh
    if (!refreshed) {
      clearTokens();
      return res; // caller handles unauthenticated state
    }
    // Retry with new access token
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
        ...options?.headers,
      },
    });
  }

  return res;
}
```

The retry is done exactly once — no infinite loop. If the retried request returns 401 again, it propagates to the caller unchanged. This prevents infinite refresh cycles when the server rejects even fresh tokens (e.g., banned user, deleted account).

The migration from `useMe`-local refresh to centralized `apiFetch` is a refactoring, not a behavior change — `useMe` already had the correct behavior, other hooks gained it. The test update is minimal: `useMe` tests no longer need to mock a refresh call sequence internally; the mock is at the `apiFetch` level.

## Related Concepts

- [[concepts/useme-auth-flow]] — `useMe` previously owned 401 retry; now delegates to `apiFetch`; the mount sequence and `telegramAuth()` restriction remain in `useMe`
- [[concepts/vite-api-base-env-var]] — `VITE_API_BASE` and the `/api` auto-prefix used inside the same `apiFetch` utility
- [[concepts/auth-security-vulnerabilities]] — Logout JTI revocation uses `apiFetch("/auth/logout", { method: "POST", body: ... })` — centralized utility ensures correct token headers on this call too

## Sources

- [[daily/2026-05-15.md]] — Session 12:08: 401-refresh moved from `useMe` to `apiFetch`; all hooks gain automatic retry; duplication removed; 720+ unit tests still pass after refactor
