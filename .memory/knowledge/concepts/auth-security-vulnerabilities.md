---
title: "Auth Security Vulnerabilities Found in Code Review"
aliases: [auth-security-bugs, xff-spoofing, idempotency-race, refresh-token-leaks, client-errors-dos, rate-limit-buckets]
tags: [security, authentication, code-review, rate-limiting]
sources:
  - "daily/2026-05-03.md"
  - "daily/2026-05-08.md"
created: 2026-05-03
updated: 2026-05-08
---

# Auth Security Vulnerabilities Found in Code Review

Security vulnerabilities found in two major code reviews of the Poputchiki project: the 2026-05-03 review of `feat/auto-dev` (4 bugs) and the 2026-05-08 pre-release review (additional 3 bugs). All found before reaching production.

## Key Points

- **Critical (2026-05-03)**: XFF spoofing bypasses rate-limit — `X-Forwarded-For` accepted without validation, attacker rotates IP to reset rate-limiter
- **Critical (2026-05-03)**: Race condition in idempotency middleware — concurrent identical requests both pass uniqueness check before either writes
- **Important (2026-05-03)**: `deleted_at` not checked in `/auth/refresh` — soft-deleted users can refresh tokens indefinitely
- **Important (2026-05-03)**: Logout does not revoke access token JTI — access token stays valid until natural expiry
- **Critical (2026-05-08)**: `POST /api/client-errors` mounted before auth+rateLimit — public endpoint = DoS amplifier (expensive DB write per request)
- **Critical (2026-05-08)**: `rate_limit_buckets` table has no cleanup → 72M rows/day at 50k DAU → DB exhaustion
- **Important (2026-05-08)**: `bannedUser` middleware blocked `PATCH /me` (profile update) in addition to sensitive actions — should only block sensitive operations, not profile reads/updates

## Details

The XFF spoofing issue is a common rate-limiter bypass: if the middleware trusts `X-Forwarded-For` (or `X-Real-IP`) as the client IP without verifying it against a known-safe proxy chain, any client can set arbitrary values and appear as a new IP. The fix requires either trusting only the rightmost untrusted IP in the XFF chain, using a proxy-validated IP source, or combining rate-limiting with user identity rather than IP alone.

The idempotency race condition follows a classic check-then-act pattern: read idempotency key from cache/DB → if absent, process request → write result. If two identical requests arrive simultaneously, both may read "absent" before either writes, resulting in duplicate processing. The fix requires an atomic upsert or a distributed lock (e.g., `INSERT ... ON CONFLICT DO NOTHING` returning whether the row was actually inserted as the gate).

The refresh token / `deleted_at` gap: the `/auth/refresh` endpoint validates JWT signature and expiry but does not check whether the user record has `deleted_at IS NOT NULL`. A user who is soft-deleted (e.g., banned) can continue obtaining new access tokens as long as they hold a valid refresh token. Fix: add `AND deleted_at IS NULL` to the user lookup in the refresh handler.

The logout / JTI gap: the logout endpoint invalidates the refresh token in the `revoked_tokens` table, but does not record the current access token's JTI. Access tokens are short-lived (typically 15 min) but during that window the user remains authenticated to all endpoints. Proper fix: add the access token's JTI to `revoked_tokens` on logout and check JTI on every authenticated request.

These vulnerabilities are consistent with code written autonomously by subagents that lacked full context of the security threat model ("every user = potential attacker, deny-by-default everywhere"). Code review at the branch boundary before merge into `dev` is the effective gate.

### 2026-05-08 Additional Findings

**`POST /api/client-errors` public DoS amplifier**: The client error reporting endpoint was mounted before auth and rate-limiting middleware. Any unauthenticated attacker can flood this endpoint with arbitrary payloads, each triggering a DB write to `error_log`. Fix: add rate limiting to the endpoint itself, or apply `bodyLimit` before any DB write path.

**`rate_limit_buckets` table without cleanup**: The in-DB rate limiter writes a row per request per user. At 50,000 DAU and 100 req/min average, this generates ~72M rows/day. Without a periodic cleanup job, the table grows unbounded, degrading query performance on the entire rate-limiter path. Fix: add a cron job to `DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 hour'`.

**`bannedUser` middleware scope too broad**: The middleware was registered to block the entire `/me` route group, including `GET /me` (profile read) and `PATCH /me` (profile update). A banned user should still be able to read their profile and understand why they're banned, but not perform sensitive operations (create rides, send messages, etc.). Fix: apply `bannedUser` only at specific action endpoints, not the entire profile group.

## Related Concepts

- [[concepts/subagent-git-author]] - Same code review session that caught author identity violations; security bugs co-occur with process violations in subagent-written code
- [[concepts/rls-guc-identity]] - RLS is the DB-level defense; these bugs are API-layer gaps that bypass RLS
- [[concepts/deployment-pipeline]] - Pre-merge code review is the gate that should catch these before reaching `dev`
- [[concepts/csrf-startswith-prefix-attack]] - Separate category of security bugs found in 2026-05-08 review: CSRF and webhook timing
- [[concepts/hono-use-vs-handler-chain]] - `bannedUser` middleware scope issue is the same class as `.use()` all-methods bug

## Sources

- [[daily/2026-05-03.md]] - Session 11:54: code review of feat/auto-dev; 2 critical (XFF rate-limit bypass, idempotency race) + 2 important (soft-delete refresh bypass, logout JTI not revoked) found via superpowers:code-reviewer subagent; branch squash-merged only after issues noted and attributed to correct author
- [[daily/2026-05-08.md]] - Session 09:28 and 12:33: pre-release code review found client-errors DoS (public before auth), rate_limit_buckets no cleanup (72M rows/day at 50k DAU), bannedUser blocking PATCH /me (overly broad scope); all fixed in `fix` branch before merge to dev
