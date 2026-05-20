---
title: "React useEffect Memory Leak — Map Event Handlers Without Cleanup"
aliases: [useeffect-cleanup, map-event-leak, leaflet-event-cleanup]
tags: [frontend, react, leaflet, gotcha, performance]
sources: ["daily/2026-05-20.md"]
created: 2026-05-20
updated: 2026-05-20
---

# React useEffect Memory Leak — Map Event Handlers Without Cleanup

## Суть

`web/src/components/MapView.tsx` — `map.on('moveend', handler)` регистрируется в useEffect без cleanup-функции. При каждом remount компонента (навигация вкладок, React StrictMode double-invoke) добавляется новый обработчик поверх старого. Обработчики накапливаются, вызываются кратно, карта деградирует.

## Механика

```tsx
// Проблема
useEffect(() => {
  map.on('moveend', handleMoveEnd);
  // нет return () => map.off(...)
}, [map]);

// Исправление
useEffect(() => {
  map.on('moveend', handleMoveEnd);
  return () => {
    map.off('moveend', handleMoveEnd);
  };
}, [map]);
```

## Симптомы

- `handleMoveEnd` вызывается N раз после N mount/unmount циклов
- Лишние API-запросы геокодирования при каждом движении карты
- Memory leak: замыкание не освобождается пока map живёт

## Правило

Любой `addEventListener` / `emitter.on` / `map.on` внутри useEffect **обязан** иметь соответствующий `removeEventListener` / `emitter.off` / `map.off` в cleanup. Без cleanup — гарантированный дубль в React StrictMode (dev).

## Leaflet-специфика

Leaflet хранит listeners в `map._events`. Проверить накопление: `console.log(map._events['moveend']?.length)`. Должно быть 1, если больше — утечка.
