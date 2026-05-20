---
title: "sess_bind HMAC — JWT Session Fixation Defense"
aliases: [sess-bind, tg-uid-cookie, session-fixation, jwt-session-binding, jti-hmac]
tags: [security, authentication, jwt, session-management]
sources:
  - "daily/2026-05-16.md"
created: 2026-05-16
updated: 2026-05-16
---

# sess_bind HMAC — JWT Session Fixation Defense

Replacing a `tg_uid` cookie (Telegram user ID) with a `sess_bind=HMAC(jwtSecret, jti)` cookie ties the session to a specific JWT instance rather than to a user identity. Combined with comparing `JWT.sub` against `Telegram.initDataUnsafe.user.id` on mount, this prevents cross-user session leakage (User B accessing User A's profile).

## Key Points

- `tg_uid` cookie stores Telegram user ID — attacker who captures a cookie can reuse it for any JWT belonging to that user
- `sess_bind=HMAC(jwtSecret, jti)` binds session to a specific JWT issuance; stolen cookie is useless without matching JWT
- `useMe.ts` must compare `JWT.sub` (from decoded access token) with `Telegram.initDataUnsafe.user.id` on mount — mismatch → `clearTokens()` → re-auth
- ACCESS_TTL reduced from 24h to 15min — limits the window of a stolen access token
- JWT_SECRET minimum raised from 16 to 32 characters — brute-force resistance
- NONCE_TTL raised from 10min to 1h — closed 50-minute replay window where previous nonce could be replayed

## Details

The root cause of the User B / User A session leak: a user opening the Mini App received tokens from the server, which were stored in localStorage. If a second user opened the app on the same device (or the token was somehow shared), the browser had no mechanism to detect that the current Telegram identity differed from the identity in the stored JWT. The app happily showed User A's profile to User B.

The `sess_bind` defense adds a server-set HttpOnly cookie on login that contains `HMAC(jwtSecret, jti)`. On every authenticated request, the server verifies that the `sess_bind` cookie matches the `jti` claim in the Bearer token. If cookies were cleared (e.g., browser cache wipe) but localStorage tokens remain, or vice versa, the request is rejected.

The client-side guard in `useMe.ts`:

```typescript
useEffect(() => {
  const storedSub = parseJwt(getAccessToken())?.sub;
  const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString();
  if (storedSub && telegramId && storedSub !== telegramId) {
    clearTokens();     // flush stale tokens from another user
    telegramAuth();    // re-authenticate with current Telegram identity
  }
}, []);
```

This guard fires before any API call, preventing the scenario where User B opens the app and the `useMe` hook fetches User A's profile using User A's cached tokens.

The `verifyInitData` function also received a directional freshness fix: the previous check used `Math.abs(age) > MAX` which created a symmetric window — accepting initData from the future (negative age) as valid. The corrected check is `age < -30 || age > MAX_AGE_SECONDS`, rejecting timestamps that are suspiciously in the future (clock skew tolerance ±30s) and those older than the max age.

Batch-updating ~40 test files to replace the old `authHeaders(user, token)` signature (which included user for cookie-setting) with the new signature was done with PowerShell sed scripts, with manual fixes for edge-case files that used non-standard variable names (`driverToken`, `otherToken`).

## Related Concepts

- [[concepts/auth-security-vulnerabilities]] — Parent category: JWT logout without JTI revocation, soft-deleted user refresh — same auth security domain; sess_bind closes a different gap
- [[concepts/useme-auth-flow]] — The hook where `JWT.sub` vs `Telegram.initDataUnsafe.user.id` comparison is performed on mount
- [[concepts/rls-guc-identity]] — Backend identity enforcement via GUC; sess_bind is the client-transport layer complement

## Sources

- [[daily/2026-05-16.md]] — Session 12:31: `tg_uid` cookie replaced by `sess_bind=HMAC(jwtSecret, jti)`; ACCESS_TTL 24h→15min; JWT_SECRET min 16→32 chars; NONCE_TTL 10min→1h; `verifyInitData` directional freshness fix; ~40 test files updated; `useMe.ts` JWT.sub vs Telegram user ID guard added to prevent cross-user session reuse
