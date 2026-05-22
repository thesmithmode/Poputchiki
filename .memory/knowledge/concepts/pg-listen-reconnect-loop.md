---
title: "PG LISTEN Reconnect Loop — Notification Connection Drop Recovery"
aliases: [pg-listen-reconnect, listen-notify-reconnect, sse-pg-reconnect, pg-listen-backoff]
tags: [postgresql, sse, notifications, resilience, gotcha]
sources:
  - "daily/2026-05-20.md"
  - "daily/2026-05-21.md"
created: 2026-05-20
updated: 2026-05-21
---

# PG LISTEN Reconnect Loop — Notification Connection Drop Recovery

A `pg_notify` / `LISTEN` connection is a long-lived PostgreSQL connection. When it drops (network interruption, database restart, connection pool reset), it does not reconnect automatically. All active SSE subscribers lose their notification stream permanently — until the API server itself is restarted. A reconnect loop with exponential backoff must be implemented in the notifier/dispatcher.

## Key Points

- `sql.listen("notify_user", handler)` creates one persistent connection; when it drops, the handler is never called again
- Symptoms: notifications stop arriving for all users simultaneously; no error in application logs unless the drop is explicitly caught
- Fix: wrap `sql.listen()` in a reconnect loop with exponential backoff (e.g., 1s → 2s → 4s → max 30s between attempts)
- The reconnect loop must re-register the `LISTEN` command on each new connection — the notification subscription does not survive a connection drop
- SSE clients on the frontend should also implement reconnect (EventSource auto-reconnects; custom fetch-based SSE must do it manually)

## Details

PostgreSQL's `LISTEN/NOTIFY` mechanism requires a dedicated, persistent connection. Unlike regular query connections that are borrowed from a pool and returned after each query, the LISTEN connection stays open indefinitely waiting for notifications. If this connection is interrupted — database restart, network hiccup, TCP keepalive timeout — the application does not automatically re-establish it.

The failure is typically silent: the error is caught internally by the database driver, but if the application code does not handle the disconnect event, the listening loop simply stops without logging anything visible.

Vulnerable pattern in `apps/notifier/src/index.ts`:

```typescript
// WRONG: no reconnect handling
await sql.listen("notify_user", (payload) => {
  dispatch(JSON.parse(payload));
});
// If connection drops here, notifications stop forever
```

Resilient pattern with exponential backoff:

```typescript
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

async function startListening(sql: Sql): Promise<void> {
  let delay = BASE_DELAY_MS;

  while (true) {
    try {
      console.log("Connecting to pg_notify channel...");
      await sql.listen("notify_user", (payload) => {
        dispatch(JSON.parse(payload));
      });
      // If we reach here, the listen ended without error (server closed connection cleanly)
      console.log("pg_notify channel closed by server. Reconnecting...");
    } catch (err) {
      console.error(`pg_notify connection lost: ${err}. Retrying in ${delay}ms...`);
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, MAX_DELAY_MS); // exponential backoff
    // Note: do NOT reset delay here — reset it on first successful notification dispatch
  }
}

// Reset backoff after successful dispatch (confirms connection is healthy)
function dispatch(event: NotifyEvent) {
  delay = BASE_DELAY_MS; // reset on first success
  // ... fan-out to SSE streams
}
```

The `postgres.js` library emits an error event on connection drop that can also be caught via `sql.on("error", handler)`. Combining both the `catch` around `sql.listen()` and the `sql.on("error", handler)` provides defense-in-depth.

**SSE client reconnect:** The notifier dropping its pg_notify connection affects all SSE clients simultaneously. If the SSE delivery path uses `EventSource`, the browser auto-reconnects after the stream closes. Custom fetch-based SSE (using `ReadableStream`) must implement reconnect manually. The browser reconnect handles client-side SSE; the notifier reconnect handles the server-side notification source.

**Relationship to connection pool:** The `LISTEN` connection should be separate from the connection pool used for queries (see [[concepts/sse-pool-connection-ceiling]]). A reconnect loop on the listener connection does not affect the query pool. If using `postgres.js`, create a separate `Sql` instance specifically for `LISTEN`:

```typescript
const notifyClient = postgres(DATABASE_URL, { max: 1, idle_timeout: 0 }); // dedicated connection
const queryClient = postgres(DATABASE_URL, { max: 20 }); // regular pool
```

## Related Concepts

- [[concepts/pg-notify-single-channel]] — The `notify_user` channel architecture; reconnect loop is the reliability layer for this channel
- [[concepts/sse-pool-connection-ceiling]] — SSE fan-out scale limit; reconnect is a correctness concern, pool ceiling is a scale concern — both affect the same notification path
- [[concepts/enqueue-notification-helper]] — `enqueueNotification` persists to `user_notifications` before pg_notify; if the LISTEN connection is down when pg_notify fires, the DB record still exists for retrieval on reconnect
- [[concepts/postgres-js-listen-once-semantics]] — postgres.js-specific semantics: sql.listen() resolves once after ACK; reconnect loop over it creates infinite tight loop → crash-loop

## postgres.js — важное исключение

Статья выше описывает паттерн для драйверов **без** встроенного auto-reconnect (например, `pg`, `pg-listen-on-notify`). Библиотека **postgres.js** (`postgres` npm package) обрабатывает TCP-reconnect внутри через `onclose` callback — повторный вызов `sql.listen()` в reconnect-loop НЕ нужен и опасен.

`sql.listen()` в postgres.js резолвится ОДИН РАЗ — после ACK от Postgres на команду LISTEN. Обёртывание в `while(true) { await sql.listen(...) }` создаёт tight infinite loop (каждая итерация завершается мгновенно после ACK) → CPU 100% / OOM → crash-loop контейнера.

Реальный инцидент (commit 9a6a184): `attempt = 0` вместо `return` после первого успешного listen = crash-loop notifier в prod.

Правильная архитектура для postgres.js: вызвать `sql.listen()` один раз; кастомный reconnect — через `onclose` параметр при создании Sql-экземпляра. Подробнее: [[concepts/postgres-js-listen-once-semantics]].

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-api-review finding #4 CRITICAL: `notifications.ts` — PG LISTEN соединение не переоткрывается при обрыве → пользователи теряют SSE-нотификации навсегда до рестарта сервера; fix: reconnect loop с exponential backoff
- [[daily/2026-05-21.md]] — Инцидент: неправильный reconnect wrapper (attempt = 0 вместо return) вызвал crash-loop prod-notifier; postgres.js резолвит sql.listen() после ACK, не после disconnect; reconnect поверх sql.listen() = infinite loop
