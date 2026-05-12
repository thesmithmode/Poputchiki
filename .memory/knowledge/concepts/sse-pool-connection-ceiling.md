---
title: "SSE Pool Connection Ceiling (One Pool Conn per Subscriber)"
aliases: [sse-ceiling, sse-pool-limit, sse-concurrent-limit, sse-scale]
tags: [sse, realtime, database, scale, architecture, gotcha]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-08
---

# SSE Pool Connection Ceiling (One Pool Conn per Subscriber)

Each active SSE connection holds one PostgreSQL pool connection for the duration of the stream. With a pool size of 20, the theoretical maximum concurrent SSE subscribers is ~150 (accounting for non-SSE query traffic), not 50,000. This is an architectural mismatch with the project's stated 50k concurrent user target.

## Key Points

- `LISTEN/NOTIFY` in postgres.js requires a dedicated connection that stays open — it cannot be returned to the pool between notifications
- With pool `max=20`, ~15-17 connections are available for SSE (3-5 reserved for regular queries) → ~150 concurrent SSE subscribers max
- At 50,000 DAU, even 1% concurrent SSE rate = 500 connections → impossible with pool-based SSE architecture
- The fix requires: PgBouncer for query traffic + a dedicated notification channel (single shared LISTEN connection) that fans out to in-process SSE streams
- Discovered during production readiness review as an architectural blocker for the 50k scale target

## Details

The SSE implementation in `apps/api` uses postgres.js's `sql.listen()` or a `LISTEN` command inside a transaction. Each user subscribing to `/api/rides/:id/stream` creates a row in the `dispatcher.ts` subscription map and holds a pool connection. The pool connection stays open for the lifetime of the SSE stream (minutes to hours).

The concurrent connection math at 50k DAU:
- If 0.3% of users have an open SSE stream: 150 connections
- Pool max=20 → 20 connections total → SSE ceiling = 17-18 simultaneous streams

Even at 2,000 DAU (a more realistic near-term target), the ceiling is still reached if more than 20 users are simultaneously on a ride detail page with an open SSE stream.

The correct architecture (TASK-136 / future backlog):
1. **PgBouncer** in front of PostgreSQL — transaction-mode pooling for regular queries, freeing the pg pool for SSE
2. **Single shared LISTEN connection** — one persistent PostgreSQL connection listens to all channels and fans out messages to in-process SSE streams via a Node.js EventEmitter or similar
3. **Redis Pub/Sub** as an alternative fan-out layer — decouples SSE fan-out from PostgreSQL entirely

Until TASK-136 is implemented, the 50k concurrent target in the PRD and CLAUDE.md is aspirational. A more honest near-term target is 2,000–5,000 concurrent users.

Separately, the dispatcher was found to have no reconnect logic when the PostgreSQL notification connection drops (e.g., after a database restart). SSE clients would hang silently until they timeout.

## Related Concepts

- [[concepts/poputchiki-stack]] - SSE via Hono + PostgreSQL LISTEN/NOTIFY; target: 50,000 concurrent users
- [[concepts/deployment-pipeline]] - Scale requirements must be met before production release
- [[concepts/advisory-lock-pool-safety]] - Related pool management concern: long-held connections cause resource contention

## Sources

- [[daily/2026-05-08.md]] - Session 09:28: code review found each SSE connection = 1 pool connection (max=20) → ceiling ~150 concurrent, not 50k; dispatcher has no reconnect logic; TASK-136 (PgBouncer+Redis+SSE multiplex) identified as fix; recommendation to lower 50k target in PRD/CLAUDE.md until TASK-136 done
