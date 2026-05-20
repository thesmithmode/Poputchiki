---
title: "Fire-and-Forget SQL Operations Require Additional Test Mocks"
aliases: [fire-and-forget-mock, notification-insert-mock, side-effect-sql-mock]
tags: [testing, vitest, mocking, pattern, gotcha]
sources:
  - "daily/2026-05-17.md"
  - "daily/2026-05-18.md"
created: 2026-05-17
updated: 2026-05-18
---

# Fire-and-Forget SQL Operations Require Additional Test Mocks

When a fire-and-forget INSERT (notification, audit log, analytics event) is added to a route handler alongside the main query, the handler's existing tests fail because the mock SQL function now receives an additional call. The correct discipline is to add `mockResolvedValueOnce([])` for the new operation at the same time as writing the handler code — not after CI turns red.

## Key Points

- Every `sql\`INSERT ...\`` or tagged template SQL call — even fire-and-forget — counts as one resolved call on the mock
- Existing tests that set up `mockSql.mockResolvedValueOnce([...mainResult...])` now get `undefined` on the second call → `TypeError` or wrong assertion
- The CI failure appears in the handler test, not in the notification test — the developer may chase the wrong file
- Rule: add new `mockResolvedValueOnce([])` immediately when adding a side-effect INSERT; do not wait for CI
- The empty array `[]` is the correct mock value for INSERTs that return no rows

## Details

In the 2026-05-17 session, adding notification INSERTs to `ridesRouter` (triggered on booking) and `rideRequestsRouter` (triggered on accept/reject) broke four existing tests. The pattern was consistent: each route handler now issued one more SQL call than the test's mock expected. The mock had `mockResolvedValueOnce` for the main SELECT/INSERT but nothing for the notification INSERT, causing it to return `undefined` — which then failed either at the `const [row] = undefined` destructuring step or at an assertion on the return value.

The maintenance rule is straightforward: think of the mock call count as a contract between the handler and the test. Any time the handler adds a SQL call — even a side-effect call with a discarded result — the corresponding test must add a matching `mockResolvedValueOnce`. The order matches the execution order in the handler.

```typescript
// Handler added this fire-and-forget:
sql`INSERT INTO user_notifications (user_id, type, data) VALUES (${driverId}, 'booking', ${payload})`.catch(noop);

// Test must add this mock BEFORE the assertion:
mockSql
  .mockResolvedValueOnce([{ id: rideId, ... }])  // main query result
  .mockResolvedValueOnce([])                       // notification INSERT (new)
```

The `catch(noop)` pattern for fire-and-forget means the promise is not awaited by the handler — but the SQL mock is still invoked synchronously when the tagged template is called. In `vitest`, mocks track all calls in order regardless of whether the caller awaits the result.

A secondary lesson from this session: when adding notification infrastructure across multiple router files simultaneously, update ALL affected test files in the same commit batch. Pushing the router changes without the test updates guarantees a red CI.

## Related Concepts

- [[concepts/vi-fn-undefined-sql-mock]] — Same root cause: `vi.fn()` returns undefined without explicit mock value; fire-and-forget adds a second call that gets `undefined`
- [[concepts/batch-ci-fix-discipline]] — The correct discipline: update all mocks in one batch rather than reactive push→fail→fix cycles
- [[concepts/hono-onerror-required]] — Fire-and-forget INSERTs inside route handlers use `.catch()` to avoid bubbling errors; `app.onError` is the complementary pattern for synchronous handler errors

**Mock order with enqueueNotification:** When bare `pg_notify` calls are replaced by `enqueueNotification`, the mock count increases from 1 to 2 per notification site (INSERT first, pg_notify second). The order in the test must match the execution order in the helper. Replacing all 11 call sites in one session required updating all related test files in the same commit — the same batch discipline applies at scale.

## Sources

- [[daily/2026-05-17.md]] — Session 14:04: 4 CI failures after adding notification INSERTs to ridesRouter and rideRequestsRouter; pattern: fire-and-forget INSERT = additional `mockResolvedValueOnce([])` required in adjacent test; lesson: add mock immediately when adding side-effect INSERT, not after CI fails
- [[daily/2026-05-18.md]] — Session 15:01: replacing 11 pg_notify call sites with `enqueueNotification` (2 SQL calls per site) required updating all handler tests; mock order: INSERT first → pg_notify second, must match helper implementation
