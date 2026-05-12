---
title: "Hono 4: app.onError Required for Uncaught Handler Errors"
aliases: [hono-onerror, hono-error-handling, hono-catch-middleware]
tags: [hono, error-handling, gotcha, observability]
sources:
  - "daily/2026-05-06.md"
created: 2026-05-06
updated: 2026-05-06
---

# Hono 4: app.onError Required for Uncaught Handler Errors

In Hono 4, errors thrown inside route handlers are NOT intercepted by error-handling middleware registered via `app.use()`. The only way to catch unhandled errors globally is `app.onError(handler)`. Without this, thrown errors produce 500 responses with no logging, no tracking, and no context.

## Key Points

- `app.use("*", errorMiddleware)` does NOT catch errors thrown from subsequent route handlers in Hono 4
- `app.onError((err, c) => { ... })` catches ALL uncaught errors from any handler — the correct pattern
- Discovered during TASK-098 (error tracking / observability): Plan B uses `error_log` table + admin TG-alert instead of Sentry
- `clientErrors` endpoint must be public (no auth middleware) to capture errors that occur before the user is authenticated
- Placement: `app.onError` should be set before any route registrations so it applies to all routes

## Details

In Hono 4's architecture, middleware runs in a chain before and after route handlers. If a route handler throws an error, Hono's internal error boundary catches it and — unless `onError` is configured — returns a generic 500 response. Error-handling middleware registered via `app.use()` does not intercept these errors because they are thrown after the middleware stack has already passed the point of execution for that particular `use()` handler.

The correct pattern for centralized error handling in Hono 4:

```typescript
// WRONG: catch middleware — does NOT intercept handler throws
app.use("*", async (c, next) => {
  try {
    await next();
  } catch (err) {
    // This catch DOES work for synchronous errors in the middleware chain
    // but NOT for errors thrown inside route handlers after this middleware
  }
});

// CORRECT: onError hook
app.onError((err, c) => {
  // Runs for any uncaught error in any handler
  logger.error({ err }, "Unhandled error");
  trackError(err, c.req);
  return c.json({ error: "Internal server error" }, 500);
});
```

For the Poputchiki observability implementation (Plan B, no Sentry):
- Server-side: `app.onError` writes to `error_log` table and sends TG admin alert for critical errors
- Client-side: React error boundary posts to `/api/client-errors` endpoint
- The `/api/client-errors` endpoint is intentionally public (no JWT auth) — errors before login must be captured too

## Related Concepts

- [[concepts/hono-use-vs-handler-chain]] - Related Hono middleware behavior: `.use()` scope and method specificity
- [[concepts/hono-route-prefix-test-mismatch]] - Another Hono routing/middleware behavioral gotcha
- [[concepts/auth-security-vulnerabilities]] - Error handling gaps can expose stack traces to attackers — `onError` must sanitize responses

## Sources

- [[daily/2026-05-06.md]] - Session 13:37: TASK-098 error tracking; `app.onError` required in Hono 4 — catch-middleware does not intercept thrown handler errors; `clientErrors` endpoint made public to capture pre-auth errors; Plan B observability confirmed (error_log table + admin TG-alert)
