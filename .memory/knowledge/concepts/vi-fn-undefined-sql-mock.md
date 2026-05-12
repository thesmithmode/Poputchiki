---
title: "vi.fn() Returns undefined — SQL Result Destructuring Fails in Tests"
aliases: [vi-fn-undefined, sql-mock-destructure, vitest-mock-sql]
tags: [testing, vitest, mocking, gotcha]
sources:
  - "daily/2026-05-06.md"
created: 2026-05-06
updated: 2026-05-06
---

# vi.fn() Returns undefined — SQL Result Destructuring Fails in Tests

`vi.fn()` without an implementation returns `undefined` by default. When middleware or a handler destructures the result of a SQL call (`const [row] = await sql(...)`), and that `sql` is mocked as a bare `vi.fn()`, the destructuring throws `TypeError: undefined is not iterable`. The fix is to always provide a mock implementation that returns an iterable.

## Key Points

- `vi.fn()` default return value is `undefined` — not `[]`, not `null`, not a Promise
- `const [row] = await sql\`...\`` where `sql = vi.fn()` → `await undefined` → `TypeError` at destructure
- Fix: `vi.fn().mockResolvedValue([])` for empty result, or `vi.fn().mockResolvedValue([{ id: "...", ... }])` for non-empty
- The error manifests as a test failure in the middleware (not the handler), making it appear the middleware itself is broken
- Discovered when anti-bot middleware executed a SQL lookup before the GET handler ran — GET tests had no SQL mock, causing unexpected `TypeError`

## Details

The bug pattern in Poputchiki's 2026-05-06 anti-bot middleware session:

```typescript
// Middleware under test:
export const antiBot = (sql: Sql) => async (c: Context, next: Next) => {
  const [{ count }] = await sql`SELECT COUNT(*) FROM recent_rides...`;
  if (Number(count) > RIDE_LIMIT) return c.json({ error: "Rate limited" }, 429);
  await next();
};

// Test (wrong):
const mockSql = vi.fn();  // returns undefined
// GET test fails: TypeError: undefined is not iterable (cannot read property of undefined)

// Test (correct):
const mockSql = vi.fn().mockResolvedValue([{ count: "0" }]);
```

The deceptive aspect: the test failure stacktrace points into the middleware implementation, not the test setup. The developer sees `TypeError at antiBot.ts:3` and investigates the middleware logic, not the mock. The real fix is one line in the test.

A secondary issue revealed in the same session: even with a correct mock, if the middleware is registered via `app.use("/")` (all methods), GET tests unexpectedly trigger the middleware — see [[concepts/hono-use-vs-handler-chain]]. Both bugs manifested together, requiring two separate fixes.

The general principle: any `vi.fn()` mock for a function that returns data (SQL query, fetch, file read) must be given a default `mockResolvedValue` matching the expected shape. Naked `vi.fn()` is only appropriate for callbacks where the return value is ignored (event handlers, `onSuccess` callbacks, etc.).

## Related Concepts

- [[concepts/hono-use-vs-handler-chain]] - Co-occurring bug: middleware applied to all methods caused SQL mock requirement in GET tests
- [[concepts/truncate-cascade-test-isolation]] - Related test infrastructure: proper test setup/teardown for integration tests that hit real SQL
- [[concepts/hono-route-prefix-test-mismatch]] - Another category of test setup bug where the test infrastructure silently hits wrong code

## Sources

- [[daily/2026-05-06.md]] - Session 12:53: anti-bot middleware mock `vi.fn()` returned undefined; `const [row] = undefined` → TypeError; fix: `mockResolvedValue([{ count: "0" }])`; co-occurring with `.use()` all-methods issue; both required independent fixes
