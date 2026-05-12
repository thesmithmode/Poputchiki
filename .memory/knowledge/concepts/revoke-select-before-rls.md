---
title: "REVOKE SELECT Fires Before RLS — Test Expectation Mismatch"
aliases: [revoke-before-rls, rls-revoke-order, permission-denied-vs-empty, revoke-rls-test]
tags: [postgresql, rls, testing, gotcha, security]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-08
---

# REVOKE SELECT Fires Before RLS — Test Expectation Mismatch

PostgreSQL evaluates object-level privileges (GRANT/REVOKE) before Row-Level Security policies. If a role has `SELECT` revoked on a table, it receives `permission denied for table X` — not an empty result set from RLS filtering. Tests that assume RLS isolation produces zero rows will fail unexpectedly when the underlying privilege is also revoked.

## Key Points

- PostgreSQL privilege check order: **1) object privileges (GRANT/REVOKE) → 2) RLS policy (USING clause)**
- `REVOKE SELECT ON error_log FROM poputchiki_app` → any query by `poputchiki_app` on `error_log` gets `ERROR: permission denied for table error_log`, not `0 rows`
- Security test that expected `0 rows` (RLS isolation) received `permission denied` → test failed with wrong error
- Fix: update test expectation from "0 rows returned" to "permission denied error thrown"
- Both behaviors are correct security outcomes — the test's assumption about which mechanism fires was wrong

## Details

The `error_log` table stores application errors. Migration 019 contains `REVOKE SELECT ON error_log FROM poputchiki_app` to prevent normal application code from reading the error log (only admin role or service role should have access). An integration security test was written to verify that a regular user cannot read other users' error entries via RLS isolation.

The test pattern was:
```typescript
// Test: regular user should not see other users' error logs
const result = await sql`SELECT * FROM app.error_log WHERE user_id != ${myUserId}`;
expect(result).toHaveLength(0); // ← WRONG assumption
```

Because `REVOKE SELECT` had been applied, the query throws `permission denied` before RLS is even consulted. The test should be:
```typescript
await expect(
  sql`SELECT * FROM app.error_log WHERE user_id != ${myUserId}`
).rejects.toThrow(/permission denied/);
```

This is conceptually the stronger security property — `permission denied` means the role cannot access the table at all, whereas "0 rows from RLS" means the role can access the table but sees no rows matching the policy. Both prevent data leakage, but REVOKE provides the earlier, harder gate.

The lesson for test design: when testing access control, distinguish between "table is accessible but filtered" (RLS) and "table is inaccessible" (REVOKE/no GRANT). A security test that expects `0 rows` will fail if privilege denial fires first — this is not a bug in the test, but a wrong assumption about which security layer is active for that role.

## Related Concepts

- [[concepts/rls-guc-identity]] - RLS policy evaluation that happens after privilege checks
- [[concepts/ci-env-vs-docker-init]] - CI environment where this failure was discovered: role `poputchiki_app` needed to exist for REVOKE to work in migrations
- [[concepts/self-hosted-postgres]] - PostgreSQL 16 where privilege evaluation order is consistent

## Sources

- [[daily/2026-05-08.md]] - Session 13:02: security tests failed after migration 019 `REVOKE SELECT ON error_log FROM poputchiki_app`; test expected 0 rows (RLS isolation) but received `permission denied` (REVOKE fires first); fix: change test expectation from empty result to `rejects.toThrow(/permission denied/)` — both are correct security outcomes, test assumption was wrong
