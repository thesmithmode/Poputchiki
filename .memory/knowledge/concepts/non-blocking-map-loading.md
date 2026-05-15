---
title: "Non-Blocking Map Loading with Fallback Timer"
aliases: [non-blocking-map, map-loading-pattern, leaflet-fallback-timer, map-immediate-render]
tags: [frontend, leaflet, telegram, ux, pattern]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Non-Blocking Map Loading with Fallback Timer

Loading a Leaflet map should not block the UI with a loading spinner. Show the map container immediately and let tile loading happen in the background. A 5-second fallback timer shows an error state if tiles do not load — covering cases where CSP or network blocks the tile provider.

## Key Points

- Show `<MapContainer>` immediately without a loading overlay — Leaflet initializes synchronously; tiles load async in background
- Do NOT block on tile load completion — user sees the map container and controls instantly
- 5-second fallback timer: if no tile loads within 5s, show "map unavailable" message
- The fallback covers CSP-blocked tile providers, network failures, and offline scenarios
- In Telegram WebApp, tile loading depends on CSP — use `tile.openstreetmap.org` which Telegram permits; the fallback guards against any blocked provider

## Details

In Telegram MiniApps, map rendering has two concerns: (1) the Leaflet container and controls initialize synchronously and are fast; (2) tile images are fetched from an external URL that may be slow or blocked by CSP. Showing a loading spinner until tiles arrive means the user sees a blank screen for potentially several seconds — or indefinitely if tiles are blocked.

The correct pattern renders the map container without delay and adds a fallback for tile failure:

```typescript
function MapScreen() {
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!tilesLoaded) setMapError(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [tilesLoaded]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {mapError && <div className="map-error">Карта недоступна</div>}
      <MapContainer center={[55.8, 49.1]} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          eventHandlers={{ load: () => setTilesLoaded(true) }}
        />
      </MapContainer>
    </div>
  );
}
```

This approach works alongside the CSS import requirement (`import "leaflet/dist/leaflet.css"`) and the CSP-safe tile URL. The map container appears in the same render cycle as the rest of the app; tiles fill in as network requests complete. The fallback timer guards against the invisible failure case where tiles are blocked and there is no error in the console.

The 5-second threshold was chosen for Poputchiki's Telegram MiniApp context: it is long enough to allow slow mobile connections to start tile loading, but short enough that the user is not left staring at an empty container. Adjust based on your target network conditions.

## Related Concepts

- [[concepts/leaflet-css-zero-height]] - CSS import required for map to render; non-blocking loading only works if the container has height from Leaflet's stylesheet
- [[concepts/csp-tile-provider-telegram]] - Why tile.openstreetmap.org must be used; CSP failure is the primary scenario the 5s fallback guards against
- [[concepts/css-filter-dark-map-theme]] - Dark mode handled via CSS filter on tiles that load via the same non-blocking pattern

## Sources

- [[daily/2026-05-14.md]] - Session 17:45: Антон прислал скриншоты с бесконечной загрузкой карты; решение: убрать блокирующую загрузку, показывать карту сразу с fallback таймером 5с на случай недоступности тайлов
