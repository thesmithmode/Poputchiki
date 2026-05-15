---
title: "CSS Filter for Dark Theme Map — Client-Side Tile Inversion"
aliases: [dark-map-css-filter, leaflet-dark-theme, invert-hue-rotate-map, dark-tiles-client, brightness-saturate-map]
tags: [frontend, leaflet, css, dark-theme, pattern]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# CSS Filter for Dark Theme Map — Client-Side Tile Inversion

Instead of requesting dark-styled map tiles from a separate tile provider (which may be CSP-blocked or require API keys), apply a CSS `filter` to the Leaflet tile pane. Two strategies exist: `filter: invert(1) hue-rotate(180deg)` for a full dark inversion, or `filter: brightness(0.62) saturate(0.75)` for a softer dimming that preserves natural map colors.

## Key Points

- `filter: invert(1) hue-rotate(180deg)` on `.leaflet-tile-pane` — full dark mode: colors inverted and hue-rotated back; strong contrast but color accuracy degraded (water appears orange-brown)
- `filter: brightness(0.62) saturate(0.75)` — softer dim: reduces brightness and desaturates; map colors remain recognizable (water stays blue, parks stay green); preferred for night use without jarring color shifts
- No additional tile provider needed — uses same `tile.openstreetmap.org` tiles for both strategies
- CSP-safe: no external domains added, no new resource loading
- Applied conditionally based on the app's dark mode state — toggle via CSS class or inline style

## Details

Map tile providers often offer separate light and dark tile sets. Requesting dark tiles requires either a different tile URL (e.g., CartoDB Dark Matter) or an API key (Mapbox Dark). In a Telegram Mini App where CSP blocks many third-party domains (see [[concepts/csp-tile-provider-telegram]]), dark tiles from a secondary provider may be inaccessible.

The CSS filter approach applies image processing at the browser level. Two variants:

**Variant 1 — Full inversion (dramatic dark mode):**
```css
.dark .leaflet-tile-pane {
  filter: invert(1) hue-rotate(180deg);
}

/* Double-invert controls and markers to restore original colors */
.dark .leaflet-control-container,
.dark .leaflet-marker-pane {
  filter: invert(1) hue-rotate(180deg);
}
```
The double inversion on controls and markers cancels out the parent filter, keeping icons in their original colors. Without this, marker icons appear as color-negative ghosts. The visual tradeoff: green parks become magenta, blue water becomes orange-brown.

**Variant 2 — Soft dim (preferred for night use):**
```css
.dark .leaflet-tile-pane {
  filter: brightness(0.62) saturate(0.75);
}
/* Controls and markers need no correction — colors are not inverted */
```
This approach reduces brightness to 62% and desaturates by 25%. Map colors remain semantically correct — water is still blue (darker), parks still green (muted), roads still visible. It was chosen over full inversion for Poputchiki after user feedback that the inverted map looked "depressing."

In React with a theme hook:

```typescript
const { isDark } = useTheme();

<MapContainer className={isDark ? "dark" : ""}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
</MapContainer>
```

The performance impact is minimal — CSS filters are GPU-accelerated in modern browsers and WebViews. The filter applies to the rasterized tile images, not to individual vector elements, so there is no layout recalculation.

Choice guidance: use `invert + hue-rotate` when maximum contrast is needed (OLED screens, accessibility); use `brightness + saturate` when the map is frequently visible and color recognition matters (navigation, POI identification).

## Related Concepts

- [[concepts/leaflet-css-zero-height]] - Leaflet CSS import required for any map rendering; dark filter is applied after the base CSS
- [[concepts/csp-tile-provider-telegram]] - Why alternative dark tile providers (cartocdn, mapbox) are not viable in Telegram WebApp
- [[concepts/telegram-disable-vertical-swipes]] - Vertical swipe conflict on the same MapScreen; both solved in the same session
- [[concepts/poputchiki-stack]] - Leaflet + OpenStreetMap stack; dark mode is a v2 design feature

## Sources

- [[daily/2026-05-14.md]] - Session 18:44: dark theme map via CSS filter on client instead of server-side dark tiles; avoids CSP issues with alternative tile providers
- [[daily/2026-05-14.md]] - Session 20:53: user feedback "тёмный тайл депрессивный"; switched from `invert(1) hue-rotate(180deg)` to `brightness(0.62) saturate(0.75)` — softer dim preserves color semantics
