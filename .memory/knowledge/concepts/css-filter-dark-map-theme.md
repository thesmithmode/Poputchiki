---
title: "CSS Filter for Dark Theme Map — Client-Side Tile Inversion"
aliases: [dark-map-css-filter, leaflet-dark-theme, invert-hue-rotate-map, dark-tiles-client]
tags: [frontend, leaflet, css, dark-theme, pattern]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# CSS Filter for Dark Theme Map — Client-Side Tile Inversion

Instead of requesting dark-styled map tiles from a separate tile provider (which may be CSP-blocked or require API keys), apply a CSS `filter` to the Leaflet tile pane. `filter: invert(1) hue-rotate(180deg)` converts standard OpenStreetMap light tiles into a dark appearance entirely on the client, with zero additional network requests or provider dependencies.

## Key Points

- `filter: invert(1) hue-rotate(180deg)` on `.leaflet-tile-pane` inverts colors and rotates hue back — produces a dark map from light tiles
- No additional tile provider needed — uses same `tile.openstreetmap.org` tiles as light mode
- CSP-safe: no external domains added, no new resource loading
- Applied conditionally based on the app's dark mode state — toggle via CSS class or inline style
- Trade-off: colors are approximate (water may appear orange-brown instead of dark blue); acceptable for utility maps, not for cartographic precision

## Details

Map tile providers often offer separate light and dark tile sets. Requesting dark tiles requires either a different tile URL (e.g., CartoDB Dark Matter) or an API key (Mapbox Dark). In a Telegram Mini App where CSP blocks many third-party domains (see [[concepts/csp-tile-provider-telegram]]), dark tiles from a secondary provider may be inaccessible.

The CSS filter approach applies image processing at the browser level:

```css
/* Dark mode: invert and correct hue */
.dark .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg);
}

/* Ensure markers/controls are NOT inverted */
.dark .leaflet-control-container,
.dark .leaflet-marker-pane {
  filter: invert(1) hue-rotate(180deg); /* double inversion = original */
}
```

The double inversion on controls and markers cancels out the parent filter, keeping icons and labels in their original colors. Without this, marker icons appear as color-negative ghosts.

In React with a theme hook:

```typescript
const { isDark } = useTheme();

<MapContainer className={isDark ? "dark" : ""}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
</MapContainer>
```

The performance impact is minimal — CSS filters are GPU-accelerated in modern browsers and WebViews. The filter applies to the rasterized tile images, not to individual vector elements, so there is no layout recalculation.

The visual quality is "good enough" for a utility map (showing ride pickup/dropoff points in a carpooling app) but not suitable for applications where accurate cartographic colors matter. Specifically: green parks become magenta, blue water becomes orange-brown, and building outlines may lose contrast. For Poputchiki's use case (ЖК Царёво local navigation), the tradeoff is acceptable.

## Related Concepts

- [[concepts/leaflet-css-zero-height]] - Leaflet CSS import required for any map rendering; dark filter is applied after the base CSS
- [[concepts/csp-tile-provider-telegram]] - Why alternative dark tile providers (cartocdn, mapbox) are not viable in Telegram WebApp
- [[concepts/poputchiki-stack]] - Leaflet + OpenStreetMap stack; dark mode is a v2 design feature

## Sources

- [[daily/2026-05-14.md]] - Session 18:44: dark theme map via CSS filter on client instead of server-side dark tiles; avoids CSP issues with alternative tile providers
