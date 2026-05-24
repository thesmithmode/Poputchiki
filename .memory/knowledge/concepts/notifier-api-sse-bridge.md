---
title: "Notifier→API SSE Bridge — Cross-Process SSE Broadcast via Internal HTTP"
aliases: [notifier-sse-bridge, internal-sse-broadcast, cross-process-sse, sse-bridge]
tags: [backend, sse, notifications, architecture, pattern]
sources:
  - "daily/2026-05-24.md"
created: 2026-05-24
updated: 2026-05-24
---

## Проблема

`notifier` и `api` — разные Docker-контейнеры, разные процессы. `api` держит in-memory `sseManager` с активными SSE-соединениями клиентов. `notifier` не может обратиться к этому объекту напрямую.

## Решение

Внутренний HTTP endpoint в `api`: `POST /internal/sse/broadcast`.

```
notifier → [POST /internal/sse/broadcast] → api → sseManager.broadcast()
```

### API endpoint (apps/api/src/ride-requests/internalRideRequestsRouter.ts)

```ts
app.post('/internal/sse/broadcast', async (c) => {
  const secret = c.req.header('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return c.json({ error: 'Forbidden' }, 403)
  }
  const body = await c.req.json()
  sseManager.broadcast(body.event, body.data)
  return c.json({ ok: true })
})
```

### Notifier вызов (apps/notifier/src/...)

```ts
// fire-and-forget, не блокировать pg_notify loop
fetch(`${process.env.API_INTERNAL_URL}/internal/sse/broadcast`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-internal-secret': process.env.INTERNAL_API_SECRET,
  },
  body: JSON.stringify({ event: 'ride_update', data: payload }),
}).catch((e) => logger.warn({ err: e }, 'sse broadcast failed'))
```

### Env vars

| Переменная | Где используется | Значение (dev) |
|---|---|---|
| `API_INTERNAL_URL` | notifier | `http://api:3000` |
| `INTERNAL_API_SECRET` | notifier + api | случайная строка |

## Почему такое решение, даже если кажется странным

Альтернатива — Redis pub/sub или общая шина. Но стек уже имеет Postgres `LISTEN/NOTIFY`, и добавлять Redis ради одного broadcast нецелесообразно. Внутренний HTTP проще: нет новых зависимостей, endpoint защищён секретом, легко тестировать.

## Связи

- [[sse-named-events-onmessage-gap]] — баг, обнаруженный при реализации этого паттерна
