---
title: "Advisory Lock Pool Safety: xact-level vs session-level"
aliases: [advisory-lock, pg-advisory-lock, advisory-xact-lock, connection-pool-lock, withLock]
tags: [database, postgresql, concurrency, gotcha]
sources:
  - "daily/2026-05-04.md"
  - "daily/2026-05-22.md"
created: 2026-05-04
updated: 2026-05-22
---

# Advisory Lock Pool Safety: xact-level vs session-level

`pg_try_advisory_lock` acquires a session-level lock — owned by the PostgreSQL backend connection, not the current transaction. In a connection pool, the `unlock` call in a `finally` block can execute on a different connection than the one that acquired the lock, leaving it permanently held.

## Key Points

- `pg_try_advisory_lock(key)` = session-level: survives transaction end, must be explicitly released via `pg_advisory_unlock`
- In a pool, `pg_advisory_unlock` in `finally` may run on a different connection — silently returns `false`, lock is never released
- `pg_try_advisory_xact_lock(key)` = transaction-level: auto-released at transaction end (commit or rollback), pool-safe by design
- Correct pattern: call `pg_try_advisory_xact_lock` inside `sql.begin()` so lock lifecycle matches transaction lifecycle
- The bug is silent — no error, no exception — just a stuck lock that eventually deadlocks concurrent requests on pool size > 1

## Details

The bug manifests when `withLock` wraps a critical section using the session-level form:

```typescript
// WRONG: session-level lock with connection pool
const locked = await sql`SELECT pg_try_advisory_lock(${key})`;
try {
  // ... work ...
} finally {
  await sql`SELECT pg_advisory_unlock(${key})`; // may use different connection!
}
```

When the pool routes the `finally` call to a different backend, `pg_advisory_unlock` attempts to release a lock not held by that connection. PostgreSQL returns `false` without raising an error. The original connection retains the lock until the session (connection) is closed — which in a long-lived pool may be never.

The fix: use transaction-level advisory locks, which PostgreSQL releases automatically at transaction end regardless of which connection commits or rolls back:

```typescript
// CORRECT: transaction-level advisory lock
await sql.begin(async (tx) => {
  const [{ locked }] = await tx`SELECT pg_try_advisory_xact_lock(${key}) AS locked`;
  if (!locked) throw new LockBusyError();
  // ... all work within same transaction ...
}); // lock auto-released here
```

This pattern was discovered in Poputchiki when reviewing TASK-089's `withLock` helper. The initial implementation used `pg_try_advisory_lock` with a `finally` block. Code review before merging to `dev` caught the race condition. The fix rewrote `withLock` to accept a transaction (`tx`) parameter and use `pg_try_advisory_xact_lock` exclusively.

A secondary finding from the same session: TASK-089 created `withLock` but left 4 cron job files using inline advisory lock patterns rather than migrating them to the new helper. This is a class of incomplete refactoring — the abstraction exists but not all callers use it — that coverage checks may not catch if the inline code still runs.

## Silent hole: winner crashes before completion

При dual-instance cron (blue/green deploy) `pg_try_advisory_xact_lock` корректно гарантирует, что задачу выполняет ровно один инстанс. Но если winner падает до завершения:
- Транзакционный lock auto-release при ROLLBACK → lock свободен
- Второй инстанс уже вышел (проиграл lock и не ждёт)
- Результат: 0 поездок/записей молча, без ошибки в логах
- Следующий шанс: по расписанию (до часа ожидания)

Митигация: `oncePer` с timestamp в БД — если timestamp не записан (winner упал до commit), следующий планировщик запустит задачу без ожидания.

Источник: [[daily/2026-05-22.md]] — Session 17:49: expand_templates с advisory lock, двойной инстанс при blue/green deploy.

## Related Concepts

- [[concepts/postgres-js-isolation-level]] - Same `sql.begin()` pattern used for both isolation level and advisory locks
- [[concepts/rls-guc-identity]] - `withIdentity()` wrapper provides the transaction context where `withLock` should be called
- [[concepts/scope-creep-sentinel]] - TASK-089 created `withLock` but left 4 cron files using inline locks — incomplete refactoring mirrors the scope boundary issue

## Sources

- [[daily/2026-05-04.md]] - Session 09:48: `withLock` rewritten from `pg_try_advisory_lock` (session-level) to `pg_try_advisory_xact_lock` inside `sql.begin()`; root cause: pool can route `pg_advisory_unlock` to different connection; 4 cron files still using inline pattern identified as follow-up work
