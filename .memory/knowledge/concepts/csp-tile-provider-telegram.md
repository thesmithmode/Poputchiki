---
title: "Telegram WebApp CSP Blocks Third-Party Map Tile Providers"
aliases: [csp-telegram-tiles, cartocdn-blocked, openstreetmap-tiles-telegram, csp-tile-provider]
tags: [telegram, frontend, leaflet, csp, gotcha, deployment]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Telegram WebApp CSP Blocks Third-Party Map Tile Providers

Telegram's Mini App WebView enforces a Content Security Policy that blocks requests to many third-party domains. Map tile providers served from CDNs (CartoDB, Mapbox, Stamen) are blocked, resulting in an empty gray grid where the map should be. The fix is to use `tile.openstreetmap.org` which Telegram's CSP allows.

## Key Points

- Telegram WebApp CSP blocks `*.cartocdn.com`, Mapbox, and other third-party tile domains → empty map grid, no console error
- `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` is permitted by Telegram's CSP
- The failure is invisible in browser DevTools during local development — only manifests inside Telegram's WebView
- No error in console; network requests to blocked domains are silently dropped or return empty responses
- The CSP restriction also eliminates "dark tile" options like CartoDB Dark Matter — CSS filter workaround required for dark mode

## Details

Leaflet requests map tiles from a tile provider URL. The `TileLayer` component fetches PNG images from subdomains (typically `a.`, `b.`, `c.`) of the configured tile URL. In a standard browser, any tile provider URL works. In Telegram's Mini App WebView, the built-in Content Security Policy restricts which external domains can be contacted.

CartoDB tiles (`{s}.basemaps.cartocdn.com`) were the initial choice for Poputchiki because CartoDB provides a clean light/dark tile variant without requiring an API key. When tested in the browser, the tiles loaded correctly. When opened inside Telegram Desktop, the map rendered as an empty gray grid — the tile images were blocked by Telegram's CSP before they could load.

Diagnosis: Open the Mini App via Telegram's web client (`web.telegram.org`) and inspect browser DevTools Network tab. Blocked requests appear as failed/canceled without a CORS error — they are rejected at the CSP level before completing. In the native Telegram client, no DevTools access is available.

The fix: switch the tile URL to OpenStreetMap's tile CDN:

```typescript
<TileLayer
  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
/>
```

OpenStreetMap's tile servers are on a widely allowlisted domain that Telegram's CSP permits. This matches the default Leaflet tile configuration recommended in Leaflet's own documentation.

The CSP restriction also eliminates access to CartoDB Dark Matter tiles for dark mode. Since the dark tile provider is CSP-blocked, the alternative is to apply a CSS filter to the standard light tiles: `filter: invert(1) hue-rotate(180deg)` on `.leaflet-tile-pane` produces a dark appearance from light tiles with no additional network requests or external domain dependencies.

## Related Concepts

- [[concepts/css-filter-dark-map-theme]] - CSS filter workaround for dark mode that avoids needing a separate (CSP-blocked) dark tile provider
- [[concepts/leaflet-css-zero-height]] - Co-discovered during the same MapScreen implementation; Leaflet CSS import also required
- [[connections/telegram-webapp-invisible-constraints]] - Part of the 5 invisible Telegram WebApp constraints; all require testing inside the actual Telegram client
- [[concepts/poputchiki-stack]] - Leaflet + OpenStreetMap is the confirmed map stack; CartoDB ruled out by CSP

## Sources

- [[daily/2026-05-14.md]] - Session 17:45: CartoDB tiles blocked by Telegram WebApp CSP → empty map grid; switched to `tile.openstreetmap.org`; dark mode tiles also blocked → CSS filter workaround chosen instead
