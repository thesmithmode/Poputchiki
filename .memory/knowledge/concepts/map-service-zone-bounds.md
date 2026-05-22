---
title: Map Service Zone Bounds (Leaflet maxBounds)
slug: map-service-zone-bounds
type: concept
tags: [leaflet, map, ux, frontend]
created: 2026-05-22
updated: 2026-05-22
---

# Map Service Zone Bounds (Leaflet maxBounds)

## Key Points

- `maxBounds: [[55.2, 48.3], [56.4, 50.2]]` ограничивает MapPicker зоной Казань + 0.2° padding
- `maxBoundsViscosity: 1.0` — жёсткий bounce, пользователь не может панировать за границу
- `minZoom: 9` — запрет уменьшения до уровня «вся Россия»
- `RouteMapLeaflet` — полностью non-interactive (превью маршрута, не пикер); `dragging/zoomControl/scrollWheelZoom` отключены

## Details

Bbox зоны сервиса покрывает Казань (55.79°N, 49.12°E), Кощаково (55.87°N, 49.25°E) и Старое Шигалеево (55.81°N, 49.44°E) с запасом 0.2° по всем сторонам.

```ts
// MapPicker — интерактивный пикер точки
const map = L.map(ref.current, {
  maxBounds: [[55.2, 48.3], [56.4, 50.2]],
  maxBoundsViscosity: 1.0,
  minZoom: 9,
});

// RouteMapLeaflet — превью маршрута, только отображение
const map = L.map(ref.current, {
  dragging: false,
  zoomControl: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
});
```

`maxBoundsViscosity: 1.0` (диапазон 0..1) означает полную жёсткость: карта упирается в границу и не уходит за неё. Значение 0.5 даёт «мягкий» эффект пружины — пользователь может немного утянуть за край, но карта возвращается.

Без `minZoom: 9` пользователь может отдалиться до уровня страны и потерять контекст зоны сервиса.

## Related Concepts

- [[concepts/poputchiki-stack]] — Leaflet + OSM без API-ключа
- [[concepts/nominatim-region-import]] — геокодер самохостинг для Татарстана

## Sources

- daily/2026-05-22.md — сессия 17:11, FIX: ограничить карту зоной обслуживания
