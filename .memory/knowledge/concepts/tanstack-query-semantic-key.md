---
title: "TanStack Query: семантический ключ вместо вычисленного времени"
aliases: [tanstack-query-key, react-query-key, query-key-semantic, date-range-query-key]
tags: [frontend, react, tanstack-query, caching, gotcha]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# TanStack Query: семантический ключ вместо вычисленного времени

Query key должен отражать *намерение* запроса (пресет, параметры политики), а не конкретное вычисленное значение времени. Вычисляемое время внутри key приводит к тому, что ключ меняется при каждом рендере → TQ считает запросы разными → fetch на каждом ре-рендере.

## Суть проблемы

```typescript
// НЕПРАВИЛЬНО: resolveDateRange() возвращает new Date().toISOString()
// → key меняется каждый миллисекунд → новый fetch на каждом рендере
const { data } = useQuery({
  queryKey: ["rides", ...resolveDateRange("24h")], // ["rides", "2026-05-22T15:00:00.001Z", "2026-05-22T15:24:00.001Z"]
  queryFn: () => fetchRides(resolveDateRange("24h")),
});
```

Симптом в тестах: mock израсходован до первого реального запроса → тест падает с "no mock remaining". Симптом в prod: бесконечные повторные запросы, flash reload каждую секунду (если заменить на округление до минуты — flash каждую минуту, но не устранение корня).

## Правильный паттерн

```typescript
// ПРАВИЛЬНО: key = намерение (пресет), queryFn вычисляет время в момент запроса
const { data } = useQuery({
  queryKey: ["rides", "list", preset, null, null], // ["rides", "list", "24h", null, null]
  queryFn: () => {
    const { from, to } = resolveDateRange(preset); // вычисляется здесь, не при рендере
    return fetchRides(from, to);
  },
  staleTime: 60_000,        // не рефетчить чаще раза в минуту
  refetchInterval: 60_000,  // автообновление каждую минуту
});
```

## Правило

Для date-range запросов:
- Key: `["resource", "list", presetName, customFrom, customTo]` — `customFrom`/`customTo` = null при пресете
- `queryFn`: `resolveDateRange(preset)` вызывается внутри функции, не при объявлении key
- `staleTime` = `refetchInterval` = период обновления (60s для большинства feed-экранов)

Округление до минуты — плохой фикс: вызывает flash reload каждую минуту. Правильный фикс — структурный: убрать вычисление времени из key.

## Распространение правила

Правило применяется ко всем TQ-хукам проекта, где key включает временной диапазон:
- `useRides` / feed-экран
- `useRideRequests`
- `useNotifications` с временным фильтром

## Related Concepts

- [[concepts/n-plus-one-sse-invalidation]] - Аналогичная проблема чрезмерных fetches, другой триггер (SSE без debounce)
- [[concepts/react-useeffect-memory-leak]] - Схожий класс: неправильный lifecycle → множество запросов

## Sources

- [[daily/2026-05-22.md]] - Session 18:05: `resolveDateRange` возвращал `new Date().toISOString()` → key менялся каждый мс → mock израсходован → тест падал. Фикс: семантический ключ `["rides", "list", "24h", null, null]` + `queryFn` вычисляет время при запросе. staleTime/refetchInterval: 60s.
