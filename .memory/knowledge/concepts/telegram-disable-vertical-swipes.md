---
title: "Telegram WebApp disableVerticalSwipes — Map Scroll Conflict"
aliases: [disableVerticalSwipes, telegram-swipe-map, telegram-vertical-swipes, telegram-swipe-conflict]
tags: [telegram, frontend, leaflet, gotcha, ux]
sources:
  - "daily/2026-05-14.md"
created: 2026-05-14
updated: 2026-05-14
---

# Telegram WebApp disableVerticalSwipes — Map Scroll Conflict

Telegram's Mini App WebView intercepts vertical swipe gestures to implement its native swipe-to-close behavior. On a full-screen map, the user's attempt to pan the map vertically is captured by Telegram's gesture recognizer — the map does not scroll, and in some cases the entire Mini App closes or collapses. Calling `window.Telegram.WebApp.disableVerticalSwipes()` prevents Telegram from intercepting these gestures.

## Key Points

- Telegram WebView captures vertical swipe events for its native "swipe down to close" gesture
- Full-screen Leaflet map requires vertical drag to pan — conflicts with Telegram's swipe recognizer
- `window.Telegram.WebApp.disableVerticalSwipes()` disables Telegram's swipe-to-close gesture, passing vertical events to the app
- Must be called after `window.Telegram.WebApp` is initialized (after `DOMContentLoaded` or in a `useEffect`)
- The conflict is invisible during browser development — Telegram's gesture interceptor only runs inside the Telegram WebView
- Re-enable with `window.Telegram.WebApp.enableVerticalSwipes()` if the user navigates away from the map screen

## Details

Telegram's Mini App SDK registers a native gesture recognizer that watches for downward swipe events. When a user swipes down from the top of the Mini App content area, Telegram animates the Mini App panel closing or collapsing. This is a native Telegram affordance consistent across all Mini Apps.

For most Mini App screens (lists, forms, feeds), the conflict is minimal — downward swipes on non-scrollable regions trigger the close gesture, while scrollable regions pass events normally. However, a full-screen Leaflet map that fills the entire viewport is a scrollable region in Leaflet's internal model but Telegram's gesture recognizer captures the events before Leaflet sees them.

The symptom: on a full-screen map in Telegram, dragging upward to pan south works. Dragging downward to pan north either does nothing (Telegram swallows the gesture without closing) or activates the Mini App close animation. The map cannot be panned in the downward direction.

The fix is called once when the map screen mounts:

```typescript
useEffect(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.disableVerticalSwipes();
    return () => tg.enableVerticalSwipes(); // restore when unmounting
  }
}, []);
```

The cleanup function re-enables vertical swipes when the user navigates away from the map screen. Other screens (feed, profile) benefit from the Telegram swipe-to-close affordance and should restore it.

`disableVerticalSwipes()` is available in Telegram Mini App SDK version 6.9 and later. Older clients may not have the method — guard with `if (tg.disableVerticalSwipes)` to avoid runtime errors on older Telegram versions.

The API is a companion to `window.Telegram.WebApp.expand()` (which expands the Mini App to full height) — both are needed for a full-screen map experience. `expand()` prevents Telegram from showing the Mini App at partial height; `disableVerticalSwipes()` prevents the swipe gesture from collapsing it.

## Related Concepts

- [[concepts/leaflet-css-zero-height]] - Full-screen map setup also requires correct CSS; both are required for a working full-screen Leaflet map in Telegram
- [[connections/telegram-webapp-invisible-constraints]] - Part of the collection of undocumented Telegram WebView constraints; this is a gesture layer conflict invisible in browser dev
- [[concepts/telegram-mainbutton-dom-conflict]] - Another Telegram SDK interaction (native UI) that conflicts with React DOM elements; same class of invisible-in-browser problem
- [[concepts/non-blocking-map-loading]] - Full-screen map pattern that makes disableVerticalSwipes necessary

## Sources

- [[daily/2026-05-14.md]] - Session 20:53: карта статичная, не скроллится вниз — Telegram перехватывает вертикальный свайп; исправлено вызовом `disableVerticalSwipes()` для Telegram WebApp SDK
