---
title: "React.lazy Screen Splitting for Telegram MiniApp Performance"
aliases: [react-lazy, lazy-loading-screens, lazy-screen-splitting, suspense-lazy, code-splitting]
tags: [frontend, react, performance, telegram, pattern]
sources:
  - "daily/2026-05-17.md"
created: 2026-05-17
updated: 2026-05-17
---

# React.lazy Screen Splitting for Telegram MiniApp Performance

Heavy screen components that pull in large dependencies (Leaflet, complex notification lists) should be loaded with `React.lazy` and `Suspense`. In a Telegram MiniApp running in a native WebView with limited CPU, this reduces initial bundle parse time and improves Time to Interactive for the first screen.

## Key Points

- `React.lazy(() => import('./screens/MapScreen'))` defers Leaflet (~40KB gzipped + JS init) until the map tab is first opened
- Wrap all lazy routes in a single `<Suspense fallback={<Spinner />}>` boundary in the router or tab container
- Heavy screens in Poputchiki: MapScreen (Leaflet), EventsScreen (notifications list), admin screens
- The default/entry-point screen (FeedScreen / RideListScreen) must NOT be lazy — it appears on every startup
- Vite handles code splitting automatically: each `React.lazy(() => import(...))` becomes a separate JS chunk

## Details

A Telegram MiniApp opens in a native system WebView that parses and executes JavaScript synchronously before the first render. When all screens ship in one bundle, the JS runtime must parse Leaflet and every other heavy dependency even if the user never opens the map tab. Lazy splitting defers that work to the moment the screen is first navigated to.

Implementation pattern with React Router v6:

```typescript
import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

// Heavy screens — split into separate chunks
const MapScreen = lazy(() => import("./screens/MapScreen"));
const EventsScreen = lazy(() => import("./screens/EventsScreen"));
const ProfileScreen = lazy(() => import("./screens/ProfileScreen"));

// Entry screen — NOT lazy (always shown on startup)
import { FeedScreen } from "./screens/FeedScreen";

export function AppRouter() {
  return (
    <Suspense fallback={<div className="screen-loading" />}>
      <Routes>
        <Route path="/" element={<FeedScreen />} />
        <Route path="/map" element={<MapScreen />} />
        <Route path="/events" element={<EventsScreen />} />
        <Route path="/profile" element={<ProfileScreen />} />
      </Routes>
    </Suspense>
  );
}
```

A single top-level `Suspense` boundary is simpler and shows the fallback only when a not-yet-loaded chunk is navigated to. Per-route boundaries allow more granular loading states but add complexity. For a bottom-tab navigation with instant tab switching UX, pre-fetching chunks on tab-hover or during idle time can eliminate the visible fallback entirely:

```typescript
// Pre-fetch the map chunk when the user hovers the map tab icon
const prefetchMap = () => import("./screens/MapScreen");
<TabIcon onMouseEnter={prefetchMap} onClick={() => navigate("/map")} />
```

In production, Vite generates `MapScreen.[hash].js`, `EventsScreen.[hash].js` etc. The WebView fetches each chunk on first navigation and caches it — subsequent tab switches are instant. The initial bundle shrinks by the combined size of all deferred screens, directly reducing the parse time the user waits for on app open.

For Poputchiki specifically: before lazy splitting, Leaflet and all heavy screen logic was parsed on every app open. After splitting, MapScreen chunk is fetched only when the user first taps the map tab — users who never open the map never pay that cost.

## Related Concepts

- [[concepts/leaflet-css-zero-height]] — Leaflet CSS must be imported inside the lazy `MapScreen` component, not at the app entry point — otherwise the CSS remains in the initial bundle and defeats the split
- [[concepts/non-blocking-map-loading]] — Complementary pattern: `React.lazy` handles the component-level chunk load; non-blocking tiles handle the asset-level tile fetch inside the component
- [[concepts/poputchiki-stack]] — Vite + React SPA where code splitting applies; Bun builds the frontend via `bun run build`
- [[concepts/telegram-disable-vertical-swipes]] — MapScreen (the primary lazy-loaded screen) also requires vertical swipe disabling for correct map pan behavior

## Sources

- [[daily/2026-05-17.md]] — Session 13:38: тяжёлые экраны (MapScreen, EventsScreen и др.) конвертированы в `React.lazy` для lazy loading; EventsScreen была полной заглушкой до добавления backend notifications endpoint; lazy splitting reduces initial bundle parse time in Telegram MiniApp WebView
