---
title: "TRUNCATE CASCADE for Test Isolation"
aliases: [truncate-cascade, test-isolation, truncateAll-helper]
tags: [testing, database, postgresql, pattern]
sources:
  - "daily/2026-05-03.md"
created: 2026-05-03
updated: 2026-05-03
---

# TRUNCATE CASCADE for Test Isolation

Integration tests that clean up state via manual DELETE statements in a specific order break when foreign key constraints form a chain. The correct pattern is a single `TRUNCATE ... CASCADE` helper that lets PostgreSQL resolve the dependency order automatically.

## Key Points

- `TRUNCATE TABLE users, rides, ... CASCADE` truncates all named tables and any tables with FK references to them, in dependency order
- Manual `DELETE FROM rides; DELETE FROM users;` fails if a third table references `rides` without being explicitly listed
- A shared `truncateAll(sql)` helper called in `beforeEach` / `afterEach` keeps test state clean without ordering knowledge
- `CASCADE` in TRUNCATE is safe in tests — it removes dependent rows but does not drop any schema objects
- Parallel test files running `TRUNCATE` concurrently can deadlock; set `fileParallelism: false` in vitest config when using TRUNCATE in integration/security suites

## Details

The pattern emerged during security test cleanup in the 2026-05-03 Poputchiki session. Tests were using `DELETE FROM` statements targeting individual tables, maintaining a manually specified deletion order (child tables before parent tables). When new tables were added to the schema, tests began failing with FK violation errors because the deletion order was now incomplete.

The fix is a helper function:

```typescript
export async function truncateAll(sql: Sql) {
  await sql`TRUNCATE TABLE users, rides, ride_requests, refresh_tokens, revoked_tokens RESTART IDENTITY CASCADE`;
}
```

`RESTART IDENTITY` resets serial sequences so auto-increment IDs start from 1 in each test, making test output deterministic. `CASCADE` handles any child tables not explicitly listed. The helper is called in `beforeEach` or `afterEach` depending on whether test isolation must be guaranteed before or after each test.

The deadlock issue: PostgreSQL's TRUNCATE acquires an `ACCESS EXCLUSIVE` lock on each table. When two parallel test files both execute `TRUNCATE ... CASCADE` targeting overlapping tables, they can deadlock waiting for each other's locks. Setting `fileParallelism: false` in `vitest.config.ts` for the integration and security test suites serializes file execution, eliminating the deadlock at the cost of some test run speed.

## Related Concepts

- [[concepts/self-hosted-postgres]] - PostgreSQL 16 context where TRUNCATE CASCADE behavior applies
- [[concepts/ci-parallel-jobs]] - Parallel CI jobs run different test suites; within a suite, fileParallelism must be controlled
- [[concepts/coverage-gate-discipline]] - Test isolation correctness is a prerequisite for valid coverage measurement

## Sources

- [[daily/2026-05-03.md]] - Session 15:59: `truncateAll(sql)` with CASCADE added to replace manual per-user DELETE (FK violations); `fileParallelism: false` in vitest.security.config.ts to prevent TRUNCATE deadlock in parallel test files
