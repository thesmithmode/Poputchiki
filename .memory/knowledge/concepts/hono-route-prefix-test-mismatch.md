---
title: "Hono Test Route Prefix Mismatch (Silent Wrong Handler)"
aliases: [hono-test-prefix, route-prefix-mismatch, hono-url-gotcha]
tags: [testing, hono, gotcha, coverage]
sources:
  - "daily/2026-05-03.md"
  - "daily/2026-05-04.md"
created: 2026-05-03
updated: 2026-05-04
---

# Hono Test Route Prefix Mismatch (Silent Wrong Handler)

When a Hono router is mounted at `/` via `createTestApp(router)`, test URLs must not include the route's original mount prefix. Including the prefix causes a different handler to match silently, returning 200 instead of the expected response — and the coverage gap remains invisible until the line-level report is inspected.

## Key Points

- `createTestApp(router)` calls `new Hono().route('/', router)` — routes are available as-is, without a prefix
- Test calling `testApp.request('/rides/${id}/cancel')` on a router with `DELETE /:id/cancel` will NOT match that handler
- Silent failure: a different handler (e.g., `DELETE /:id`) may match an unexpected segment of the URL, returning 200 with a legitimate-looking error body
- The handler targeted by the test remains 0% covered — no test failure, just a coverage gap
- Fix: test URLs must exactly match the router's own route patterns without the mount prefix

## Details

The failure pattern was discovered during TASK-027 coverage work on `ridesRouter`. The `cancelRide.test.ts` test was using `DELETE /rides/${id}/cancel` against a `testApp` that mounted `ridesRouter` at `/`. The handler `app.delete('/:id/cancel', ...)` at line 153 of `ridesRouter.ts` was reported as 0% covered despite all tests passing as green.

The reason the tests passed at all was unexpected: Hono's `DELETE /:id` handler (for soft-deleting a ride at `app.delete('/:id', ...)`) matched the path `/rides/${id}/cancel` with `:id` capturing `rides` and the remainder somehow producing a 200 response body containing `{success: false, error: "Поездка не найдена"}`. During a detailed investigation session (19:46 on 2026-05-03), the exact matching mechanics were traced: the path `/rides/${uuid}/cancel` was parsed with `:id = rides` by the `DELETE /:id` handler, which then looked up a ride with `id = "rides"` (not a valid UUID), the lookup returned no result, and the error handler returned status 200 instead of 404 due to a separate bug in the error path. The cancel handler at line 153 was never invoked. Local test execution confirmed: the test showed green (status 200) while the coverage report showed line 153 at 0% — the two signals appeared contradictory until the wrong-handler hypothesis was confirmed.

The fix is straightforward: strip the mount prefix from all test URLs. `DELETE /rides/${id}/cancel` → `DELETE /${id}/cancel`. After this correction, the cancel handler was invoked, its coverage appeared in reports, and CI passed with 100% function coverage.

This pattern can occur whenever a shared test helper mounts a router without a prefix (common in unit-style integration tests) while the developer mentally uses the full API path (e.g., `/api/rides/:id/cancel`). Always verify by checking coverage reports for 0% function coverage on handlers that "should" be tested.

## Related Concepts

- [[concepts/coverage-gate-discipline]] - Coverage reports are the signal that reveals this failure mode
- [[concepts/ci-parallel-jobs]] - CI coverage gate surfaces the gap; without it the bug is invisible
- [[concepts/c8-ignore-denominator-oscillation]] - Related coverage debugging session that occurred alongside this fix

## Sources

- [[daily/2026-05-03.md]] - `cancelRide.test.ts` used `/rides/${id}/cancel`; ridesRouter mounted at `/`; cancel handler at line 153 was 0% covered despite green tests; fixed by removing `/rides` prefix from all test URLs
- [[daily/2026-05-04.md]] - Session 01:17: same pattern repeated — support router mounted at `/api/support` but test URL used wrong prefix; described as "повторяющийся паттерн ошибок" confirming this is a systemic issue not a one-off
