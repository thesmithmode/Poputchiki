---
title: "SSE Named Events — EventSource.onmessage Only Catches Unnamed Events"
aliases: [sse-named-events, eventsource-onmessage, sse-event-field, named-sse-event]
tags: [frontend, sse, gotcha, typescript, realtime]
sources:
  - "daily/2026-05-24.md"
created: 2026-05-24
updated: 2026-05-24
---

## Суть

`EventSource.onmessage` срабатывает ТОЛЬКО для SSE-сообщений без поля `event:` (unnamed). Если сервер шлёт named event (`event: ride_update`), `onmessage` молчит — нет ни ошибки, ни предупреждения.

## Детали

SSE протокол различает два типа сообщений:

**Unnamed (default)**:
```
data: {"foo":"bar"}
```
→ `eventSource.onmessage` срабатывает

**Named**:
```
event: ride_update
data: {"foo":"bar"}
```
→ `onmessage` НЕ срабатывает, нужен:
```ts
eventSource.addEventListener('ride_update', handler)
```

## Hono

`writeSSE({ data, event })` с полем `event` генерирует named event. Типичная ловушка: разработчик пишет `onmessage = handler`, всё компилируется, но события не приходят.

```ts
// СЕРВЕР (Hono)
await writeSSE({ data: JSON.stringify(payload), event: 'ride_update' })

// КЛИЕНТ — НЕПРАВИЛЬНО (silent fail)
eventSource.onmessage = (e) => { ... }

// КЛИЕНТ — ПРАВИЛЬНО
eventSource.addEventListener('ride_update', (e) => {
  const payload = JSON.parse(e.data)
})
```

## Диагностика

1. Открыть DevTools → Network → EventStream
2. Проверить колонку `Event Type` у входящих сообщений
3. Unnamed = пустая строка → `onmessage` работает
4. Named = строка типа `ride_update` → нужен `addEventListener`

## Связи

- [[notifier-api-sse-bridge]] — архитектура, в которой этот баг был обнаружен
