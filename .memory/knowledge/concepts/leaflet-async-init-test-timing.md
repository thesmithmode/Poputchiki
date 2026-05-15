---
title: "Leaflet Async Init — mapRef.current Null During Test Clicks"
aliases: [leaflet-async-init, mapref-null-test, leaflet-test-timing, leaflet-init-wait]
tags: [frontend, leaflet, testing, gotcha, async]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Leaflet Async Init — mapRef.current Null During Test Clicks

Leaflet's map initialization is asynchronous. When a test clicks a map control (e.g., a "locate me" button) immediately after rendering the component, `mapRef.current` may still be `null` because Leaflet hasn't completed its internal initialization cycle. The test click fires on a non-existent map instance, producing a silent no-op or a null-reference error.

## Key Points

- `mapRef.current` is `null` when tests click immediately after `render()` — Leaflet init is async even when the DOM element exists
- Clicking a control that calls `mapRef.current.setView(...)` before init completes → `TypeError: Cannot read properties of null`
- Fix: await a signal that Leaflet init is complete before issuing test click events
- Leaflet fires the `load` event on the map instance when initialization is complete — use this as the await signal
- The bug manifests only in test environments with synthetic rendering; browser rendering is usually fast enough that user clicks never race against init

## Details

In React with `react-leaflet`, `MapContainer` creates a Leaflet map instance after the component mounts. The `ref` attached to `MapContainer` is populated synchronously with a ref object, but the actual Leaflet `L.Map` instance inside it is set during an asynchronous initialization phase that occurs after mount. Controls rendered as children (e.g., a locate button using `useMap()`) may not be ready to receive method calls immediately.

The failure pattern in Poputchiki's `MapScreen.test.tsx`:

```typescript
// WRONG: clicks before Leaflet init completes
render(<MapScreen />);
const locateBtn = screen.getByRole("button", { name: /геолокация/i });
await userEvent.click(locateBtn);
// → TypeError: mapRef.current is null (or map.locate is not a function)
```

The fix: wait for Leaflet's `load` event or for the map ref to be non-null before clicking:

```typescript
// CORRECT: wait for Leaflet init
render(<MapScreen />);
const locateBtn = screen.getByRole("button", { name: /геолокация/i });

// Option 1: wait for map to appear in DOM with a data attribute set on init
await screen.findByTestId("map-ready");

// Option 2: wait for map container to have specific class (Leaflet adds classes on init)
await waitFor(() => {
  expect(document.querySelector(".leaflet-container.leaflet-touch")).toBeTruthy();
});

await userEvent.click(locateBtn);
```

A reliable implementation pattern: set a `data-testid="map-ready"` attribute in a `useEffect` that runs after the Leaflet `load` event fires. The test uses `screen.findByTestId("map-ready")` (which retries until found) as its await signal before clicking.

```typescript
// In MapScreen component:
const mapRef = useRef<L.Map | null>(null);

useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  const onLoad = () => {
    document.getElementById("map-container")?.setAttribute("data-testid", "map-ready");
  };
  map.whenReady(onLoad);
}, []);
```

Alternatively, `map.whenReady(callback)` in Leaflet fires when the map is ready to accept method calls. Wrapping the test click in a `waitFor` that checks `mapRef.current !== null` also works.

The broader principle: any test interaction with a ref-based or imperatively initialized library (Leaflet, Three.js, video players) must await the library's own readiness signal before issuing programmatic interactions.

## Related Concepts

- [[concepts/leaflet-css-zero-height]] - Co-occurring Leaflet gotcha in test/render context: CSS import required for map to render at all; async init issue is separate and occurs after CSS is correct
- [[concepts/non-blocking-map-loading]] - Non-blocking map rendering pattern that ensures the map container is shown immediately; async init timing matters for both tests and the fallback timer
- [[concepts/redesign-test-maintenance-cascade]] - Context for the MapScreen redesign session where this timing issue was discovered (MapScreen promoted to tab, locate button added)

## Sources

- [[daily/2026-05-14.md]] - Session 20:53: CI failed because `mapRef.current = null` at test click time; async Leaflet init not yet complete; fix: await Leaflet init completion before firing click event in locate-me test
