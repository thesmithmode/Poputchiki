---
title: "Hono .use() Applies to All HTTP Methods (Not POST-Only)"
aliases: [hono-use-all-methods, hono-middleware-chain, hono-post-only-middleware]
tags: [hono, middleware, gotcha, testing]
sources:
  - "daily/2026-05-06.md"
created: 2026-05-06
updated: 2026-05-06
---

# Hono .use() Applies to All HTTP Methods (Not POST-Only)

`app.use("/", middleware)` in Hono registers the middleware for **all** HTTP methods on that path, including GET, PUT, DELETE, and HEAD — not just POST. When POST-only protection is needed (e.g., anti-bot, rate limiting per write operation), use the handler chain pattern `app.post("/", middleware, handler)` instead.

## Key Points

- `app.use("/", antiBot)` → anti-bot runs on GET, POST, PUT, DELETE — all methods at that path
- `app.post("/", antiBot(sql), handler)` → anti-bot runs only on POST, handler receives SQL-mocked context
- Root cause of bug: anti-bot registered via `.use()`, then GET integration tests started failing because they couldn't mock the SQL call inside the middleware
- The handler chain pattern in Hono (`app.post("/", mw1, mw2, handler)`) passes request through each function left-to-right, stopping at first `Response` return
- Method-specific `.use()` is possible via Hono's `app.use("POST /path", middleware)` but the chain pattern is cleaner for single routes

## Details

The anti-bot middleware bug surfaced in TASK-102: after registering via `app.use("/", antiBot)`, unit tests for `GET /rides` began requiring a `mockSql` that satisfied the anti-bot database lookup — even though GET requests need no bot protection. The middleware executed before the handler on every request, regardless of HTTP method.

The fix was to move the middleware from `.use()` to the specific POST handler chain:

```typescript
// WRONG: fires on GET, PUT, DELETE, HEAD — all methods
ridesApp.use("/", antiBot(sql));
ridesApp.get("/", listRidesHandler);
ridesApp.post("/", createRideHandler);

// CORRECT: fires only on POST
ridesApp.get("/", listRidesHandler);
ridesApp.post("/", antiBot(sql), createRideHandler);
```

A secondary consideration: the Hono handler chain is ordered left-to-right. Each middleware either calls `await next()` to pass control forward or returns a `Response` directly to short-circuit. Middleware that returns early (e.g., blocks a bot and returns 429) prevents the handler from executing. This makes the chain pattern a clean replacement for `app.use()` when method specificity is required.

The anti-bot middleware was also NOT applied to `/:id/request` (ride-request creation) because the semantic is different: flood protection is for ride creation, not for responding to existing rides.

## Related Concepts

- [[concepts/hono-route-prefix-test-mismatch]] - Related Hono routing gotcha: wrong URL prefix causes wrong handler to match silently
- [[concepts/auth-security-vulnerabilities]] - Rate limiting and anti-bot are security middleware; method specificity matters for correct protection scope
- [[concepts/coverage-gate-discipline]] - Incorrect middleware scope can cause misleading coverage: handler appears covered but wrong code path executed

## Sources

- [[daily/2026-05-06.md]] - Session 12:53: anti-bot middleware registered via `.use("/")` → GET tests failed (needed SQL mock); fix: moved to `app.post("/", antiBot(sql), handler)` chain; middleware NOT applied to `/:id/request` (different flood-protection semantics)
