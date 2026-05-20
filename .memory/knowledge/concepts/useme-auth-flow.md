---
title: "useMe Hook — Full Telegram MiniApp Auth Flow"
aliases: [useme-hook, useme-auth, telegram-miniapp-auth-hook, initdata-auth-flow]
tags: [frontend, telegram, authentication, react, pattern]
sources:
  - "daily/2026-05-14.md"
  - "daily/2026-05-16.md"
created: 2026-05-14
updated: 2026-05-16
---

# useMe Hook — Full Telegram MiniApp Auth Flow

`useMe` is the central auth hook in the Poputchiki frontend. On mount it executes the complete Telegram MiniApp authentication sequence: validates `initData` with the server, stores tokens, and fetches the user profile — in a single coordinated flow, not three separate effects.

## Key Points

- Full flow: `POST /auth/telegram` with Telegram `initData` → server HMAC-validates → returns `{ accessToken, refreshToken }` → save tokens → `GET /users/me` → populate auth state
- On 401 from any API call: try `/auth/refresh` first — do NOT re-trigger `telegramAuth()` because Telegram `initData` expires in minutes
- `logout()` sends both `accessToken` and `refreshToken` in the body (not just clears localStorage) AND calls `clearTokens()` after — server revokes JTI
- `apiFetch` inside `useMe` automatically prefixes non-auth paths with `/api`; auth paths (`/auth/*`) go to root directly
- On mount: compare `JWT.sub` (decoded access token) with `Telegram.initDataUnsafe.user.id` — mismatch means stale token from another user → `clearTokens()` → re-auth immediately

## Details

The authentication sequence in a Telegram MiniApp has an asymmetry: `initData` is generated once when the Mini App opens and has a short server-side validity window (Telegram recommends treating it as valid for at most 5 minutes). Because of this, the auth flow must happen exactly once on mount — re-triggering `telegramAuth()` on each 401 would fail silently when `initData` expires.

The correct `useMe` mount sequence:

```typescript
useEffect(() => {
  const initAuth = async () => {
    // 1. Attempt auth with Telegram initData
    const initData = window.Telegram?.WebApp?.initData;
    if (!initData) return; // not in Telegram — skip auth

    const { accessToken, refreshToken } = await apiFetch("/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData }),
    });

    saveTokens(accessToken, refreshToken);

    // 2. Fetch user profile with the new token
    const user = await apiFetch("/users/me");
    setUser(user);
  };

  initAuth().catch(console.error);
}, []);
```

The 401 handling is a separate concern — a global `apiFetch` interceptor or a retry wrapper:

```typescript
// On any 401: try refresh first, NEVER re-call telegramAuth()
async function apiFetchWithRefresh(path: string, options?: RequestInit) {
  let res = await apiFetch(path, options);
  if (res.status === 401) {
    const refreshed = await tryRefreshTokens(); // POST /auth/refresh
    if (refreshed) {
      res = await apiFetch(path, options); // retry original
    } else {
      clearTokens(); // refresh expired → user must re-open Mini App
    }
  }
  return res;
}
```

The logout flow must clear tokens on both client and server:

```typescript
async function logout() {
  const { accessToken, refreshToken } = getTokens();
  await apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ accessToken, refreshToken }), // server revokes JTI
  });
  clearTokens(); // client-side clear after server confirms
}
```

Sending only a `clearTokens()` call without the server-side revocation leaves the `accessToken` valid until natural expiry — a known auth vulnerability documented in [[concepts/auth-security-vulnerabilities]].

## Related Concepts

- [[concepts/auth-security-vulnerabilities]] — logout without JTI revocation and soft-deleted user refresh bypass; both mitigated by this hook's token-body logout pattern
- [[concepts/vite-api-base-env-var]] — `apiFetch` auto-prefix (`/api` for non-auth, bare for `/auth/*`) used inside this hook
- [[concepts/telegram-hashrouter-tgwebappdata]] — `initData` arrives in the URL hash which must be cleaned before mount; `useMe` reads `window.Telegram.WebApp.initData` only after the hash cleanup runs
- [[concepts/rls-guc-identity]] — the `accessToken` from this flow carries the `user_id` that the API sets as GUC for RLS

## Sources

- [[daily/2026-05-14.md]] — Session 12:58: `useMe` делает полный auth flow: `POST /auth/telegram` с initData → save tokens → `GET /users/me`; logout передаёт токены в body + вызывает `clearTokens()`; на 401 → `/auth/refresh`, не `telegramAuth()` (initData истекает)
