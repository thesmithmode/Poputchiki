---
title: "postgres.js sql.listen() — семантика однократного resolve и внутренний reconnect"
aliases: [postgres-js-listen, sql-listen-once, postgres-js-reconnect-onclose]
tags: [postgresql, postgres-js, notifications, gotcha, crash-loop]
sources:
  - "daily/2026-05-21.md"
created: 2026-05-21
updated: 2026-05-21
---

# postgres.js sql.listen() — семантика однократного resolve и внутренний reconnect

`sql.listen()` в библиотеке postgres.js резолвится ОДИН РАЗ — после подтверждения PostgreSQL команды LISTEN (ACK). Повторный вызов `sql.listen()` при переподключении не нужен: библиотека обрабатывает TCP-reconnect внутри через колбек `onclose`. Ручной цикл переподключения поверх `sql.listen()` создаёт бесконечный tight loop → CPU 100% / OOM → crash-loop контейнера.

## Key Points

- `await sql.listen("channel", handler)` резолвится сразу после ACK от Postgres, не после завершения прослушивания
- Reconnect при обрыве TCP-соединения — внутренняя ответственность postgres.js через `onclose` callback
- Паттерн `while(true) { await sql.listen(...) }` создаёт бесконечный цикл: каждый `listen` резолвится немедленно, следующая итерация начинается тут же
- Замена `return` на `attempt = 0` в reconnect-обёртке превращает линейный поток в плотный infinite loop
- Симптом: контейнер показывает `Up 25s` при перезапросе `docker ps`, рестартует каждые ~25 секунд
- Crash-loop от commit 9a6a184 — задокументированный реальный инцидент

## Details

В `apps/notifier/src/index.ts` был написан reconnect-wrapper с `while(true)`:

```typescript
// BROKEN: creates tight infinite loop
let attempt = 0;
while (true) {
  try {
    await sql.listen("notify_user", handler);
    attempt = 0; // BUG: reaches here immediately after ACK, not after disconnect
  } catch (err) {
    // ...backoff...
  }
}
```

`sql.listen()` резолвится после того, как Postgres прислал ACK на команду LISTEN — это происходит мгновенно. Значит цикл крутится без остановки, пытаясь зарегистрировать LISTEN снова и снова. Postgres.js отклоняет повторный вызов (или обрабатывает его как no-op), весь цикл выполняется на максимальной скорости. CPU уходит в 100%, heap растёт → OOM или просто crash → docker перезапускает контейнер → снова crash-loop.

Правильная архитектура: `sql.listen()` вызывается ОДИН РАЗ. Если нужен custom reconnect поверх библиотечного — использовать `onnotify` и `onclose` параметры при создании экземпляра postgres:

```typescript
// CORRECT: call listen once, library handles reconnect internally
const sql = postgres(DATABASE_URL, {
  onnotify: (channel, payload) => { /* called on each notification */ },
  onclose: () => { /* library will auto-reconnect, called before next attempt */ },
});
await sql.listen("notify_user", handler); // called ONCE
// Do not call sql.listen again — library handles reconnect via onclose
```

Если нужен ручной контроль (логирование попыток, алерты), правильный паттерн — `onclose` callback, не внешний `while(true)`:

```typescript
const sql = postgres(DATABASE_URL, {
  onclose: () => {
    logger.warn("pg_notify connection closed, library will reconnect...");
    metrics.increment("pg_listen_reconnect");
  },
});
```

**Отличие от статьи [[concepts/pg-listen-reconnect-loop]]:** Та статья описывает наивный драйвер без auto-reconnect (ванильный `pg` / `pg-listen-on-notify`). Postgres.js (`postgres` npm package) управляет reconnect сам через `onclose` — ручной while-loop поверх него избыточен и опасен.

**Mock-ловушка:** Тесты, которые мокают `sql.listen()` через `vi.fn()`, не воспроизводят реальную семантику однократного resolve. Такой мок будет вести себя так же в обоих случаях (правильный и сломанный код), скрывая баг. Нужны либо contract tests против реального Postgres, либо проверка что `sql.listen` вызывается ровно 1 раз.

## Related Concepts

- [[concepts/pg-listen-reconnect-loop]] — Паттерн reconnect-loop для библиотек БЕЗ auto-reconnect; postgres.js — исключение
- [[concepts/crash-loop-container-detection]] — Как диагностировать crash-loop по `docker ps` uptime
- [[concepts/pg-notify-single-channel]] — Архитектура `notify_user` канала, для которого используется `sql.listen()`

## Sources

- [[daily/2026-05-21.md]] — Инцидент: notifier commit 9a6a184 вызвал crash-loop в prod; root cause: `attempt = 0` вместо `return` после первого успешного listen создал tight infinite loop; postgres.js резолвит listen после ACK, не после disconnect
