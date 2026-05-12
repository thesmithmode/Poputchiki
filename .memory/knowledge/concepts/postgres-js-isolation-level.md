---
title: "postgres.js sql.begin() Isolation Level Syntax"
aliases: [postgres-js-isolation, sql-begin-gotcha, isolation-level-bug]
tags: [database, postgresql, gotcha, postgres-js]
sources:
  - "daily/2026-05-03.md"
  - "daily/2026-05-04.md"
created: 2026-05-03
updated: 2026-05-04
---

# postgres.js sql.begin() Isolation Level Syntax

`postgres.js`'s `sql.begin()` method concatenates the options string directly after `BEGIN`, producing invalid SQL if a shorthand form is passed. The caller must always supply the full `ISOLATION LEVEL` prefix.

## Key Points

- `sql.begin("repeatable read")` generates `BEGIN repeatable read` → PostgreSQL syntax error
- Correct call: `sql.begin("ISOLATION LEVEL REPEATABLE READ")` → `BEGIN ISOLATION LEVEL REPEATABLE READ`
- Fix location: normalize in the library wrapper (`with-identity.ts`), not in every caller
- postgres.js also guarantees: `timestamptz` columns always return JavaScript `Date`; `BIGINT` columns always return `string`
- Defensive ternary guards for these guaranteed types = dead code, remove rather than test
- postgres.js native array parameters: pass JS arrays directly as query parameters — postgres.js converts to `ARRAY[...]` automatically; never string-join array values manually

## Details

The `sql.begin(options)` API in postgres.js appends the options string directly to the SQL `BEGIN` keyword. PostgreSQL's grammar requires `BEGIN ISOLATION LEVEL <name>`, not `BEGIN <name>`. Passing the shorthand `"repeatable read"` or `"serializable"` alone produces a syntax error that surfaces at runtime, not at compile time.

The architectural fix is to normalize the input in the shared `with-identity.ts` helper that all authenticated API handlers use. The helper accepts simple names (`"repeatable read"`, `"serializable"`) and prepends `ISOLATION LEVEL` before passing to `sql.begin()`. This keeps callers clean and enforces correct SQL at a single point.

A related type guarantee: postgres.js maps PostgreSQL `timestamptz` to JavaScript `Date` objects and `BIGINT` to JavaScript `string` values. Shape functions that guard against `typeof value === 'string' ? value : value.toString()` for a `BIGINT`-typed column are unreachable branches. These should be deleted (not `c8 ignore`'d), as their presence indicates a misread of the library contract.

## Related Concepts

- [[concepts/rls-guc-identity]] - `with-identity.ts` is where GUC variables and transaction isolation are both set
- [[concepts/self-hosted-postgres]] - PostgreSQL 16 context where these behaviors apply
- [[concepts/coverage-gate-discipline]] - Unreachable branches for guaranteed types = remove, not annotate

## Sources

- [[daily/2026-05-03.md]] - `sql.begin("repeatable read")` → SQL syntax error; fixed by normalizing to full `ISOLATION LEVEL` string in with-identity.ts; postgres.js type guarantees documented
