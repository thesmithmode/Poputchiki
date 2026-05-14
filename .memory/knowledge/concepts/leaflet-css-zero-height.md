---
title: "Leaflet CSS Import Required — Map Collapses to 0px Without It"
aliases: [leaflet-css, leaflet-zero-height, leaflet-import-css, leaflet-collapsed-map]
tags: [frontend, leaflet, gotcha, css]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Leaflet CSS Import Required — Map Collapses to 0px Without It

Leaflet's map container renders as a 0px-height element unless `leaflet/dist/leaflet.css` is explicitly imported. The JavaScript library initializes without errors, tiles load in the background, but nothing is visible because the container has no intrinsic height from Leaflet's own styles.

## Key Points

- `import "leaflet/dist/leaflet.css"` must appear in the component or entry file — without it the map div collapses to 0px
- The JavaScript API works normally: no errors in console, tile requests fire, event listeners attach — only the visual rendering is missing
- The symptom is a blank area where the map should be, not an error boundary or crash
- For full-screen maps, combine Leaflet CSS with `position: fixed; inset: 0` instead of `height: 100vh` inside a padded container — `100vh` inside a flex/padded layout causes overflow and scrollbar issues
- Discovered during v2 redesign when MapScreen was promoted from child route to a dedicated tab

## Details

Leaflet is a JavaScript library for interactive maps. Unlike many modern component libraries that inject their own CSS via CSS-in-JS or shadow DOM, Leaflet relies on a traditional external stylesheet for its layout, controls, and tile positioning. The stylesheet defines critical layout rules for `.leaflet-container`, `.leaflet-tile-pane`, and `.leaflet-control` elements. Without these rules, the map container has no height (collapses to content height, which is 0px for an empty div) and tile layers are not positioned correctly.

The failure is deceptive because Leaflet's JavaScript API operates normally without the CSS. The `L.map()` constructor succeeds, `L.tileLayer()` begins fetching tiles, and event listeners work. A developer inspecting the console sees no errors. The network tab shows tile requests completing successfully. The only visible symptom is that the map area is blank or invisible — the container exists in the DOM but has zero rendered height.

The correct import pattern in a React + Vite project:

```typescript
// MapScreen.tsx
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer } from "react-leaflet";

export function MapScreen() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <MapContainer center={[55.8, 49.1]} zoom={13} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      </MapContainer>
    </div>
  );
}
```

A secondary layout finding from the same redesign session: using `height: 100vh` for a full-screen map inside a layout with padding or a fixed bottom tab bar causes the map to overflow the viewport, creating an unwanted scrollbar. The correct approach is `position: fixed; inset: 0` on the map wrapper, which removes it from the normal document flow and makes it fill the entire viewport regardless of parent padding. The bottom tab bar then overlays the map with its own `position: fixed` and `z-index`.

## Related Concepts

- [[concepts/poputchiki-stack]] - Leaflet + OpenStreetMap is the map stack; no API key required
- [[concepts/redesign-test-maintenance-cascade]] - MapScreen redesign (tab promotion, back button removal) triggered cascading test updates alongside this CSS discovery

## Sources

- [[daily/2026-05-14.md]] - Session 17:11: Leaflet requires `import "leaflet/dist/leaflet.css"` otherwise map collapses to 0px; `position: fixed; inset: 0` for full-screen map instead of `height: 100vh` inside padded layout
