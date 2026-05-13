---
title: "bodyLimit Must Precede rateLimit to Prevent DoS Amplification"
aliases: [bodyLimit-order, rateLimit-bodyLimit, middleware-dos-amplification, bodyLimit-middleware]
tags: [security, middleware, hono, performance, gotcha]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-13
---

# bodyLimit Must Precede rateLimit to Prevent DoS Amplification

Middleware executes in registration order. Placing `rateLimit` before `bodyLimit` means the request body is fully received and buffered before rate limiting runs. An attacker not yet rate-limited can send arbitrarily large request bodies, consuming server memory proportional to body size per request. `bodyLimit` must come first to reject oversized bodies before rate counting.

## Key Points

- Correct order: `bodyLimit` → `rateLimit` → auth → handler
- Wrong order: `rateLimit` → `bodyLimit` → handler (body buffered before rate check)
- An attacker can exhaust server memory by sending large bodies in rapid succession before the rate limiter counts them
- `bodyLimit` in Hono: `import { bodyLimit } from 'hono/body-limit'`; limit in bytes (e.g., `102400` for 100KB)
- General principle: rejection guards (size, format, allowlist) always before resource-consuming operations

## Details

In an HTTP request processing pipeline, the order of middleware determines what work is done before what. Rate limiting is meant to be an early gate that prevents excess requests from consuming server resources. However, if the server accepts and buffers the entire request body before checking the rate limit, a single attacker can consume memory for each uncounted request.

Consider a JSON API endpoint that accepts payloads up to 10MB. Without `bodyLimit` before `rateLimit`: the server buffers 10MB into memory, then checks the rate counter, then increments it, then processes the body. If the attacker sends 50 such requests per second and the rate limit is 100/min, they consume 500MB of memory in the first second, repeated until the rate limit triggers.

With `bodyLimit` first: request arrives, size check fires immediately, oversized body is rejected with 413 before buffering completes, rate limit is never reached. Memory impact is bounded to the `bodyLimit` value, not attacker-controlled.

The same principle applies to other early-rejection middleware: IP allowlisting, bot detection via User-Agent, and request format validation should all precede computationally expensive middleware. The pattern is: cheapest rejection first, most expensive processing last.

## Related Concepts

- [[concepts/hono-use-vs-handler-chain]] - Hono middleware chain execution order; `.use()` registration order determines execution sequence — the same ordering principle applies
- [[concepts/auth-security-vulnerabilities]] - Related class of DoS vulnerabilities: `POST /api/client-errors` mounted before auth (same amplification pattern at the route level vs middleware level)

## Sources

- [[daily/2026-05-08.md]] - Session 12:33: code review found `bodyLimit` registered after `rateLimit` → DoS amplification risk; fix: reorder middleware to `bodyLimit` → `rateLimit` → auth → handler; classified as important security finding in fix branch
