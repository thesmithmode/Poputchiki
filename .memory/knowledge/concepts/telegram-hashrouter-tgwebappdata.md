---
title: "Telegram #tgWebAppData Hash Fragment Conflicts with React HashRouter"
aliases: [tgwebappdata-hash, hashrouter-telegram, hash-conflict-telegram, telegram-hash-cleanup]
tags: [telegram, react, frontend, gotcha, routing]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Telegram #tgWebAppData Hash Fragment Conflicts with React HashRouter

Telegram Desktop appends `#tgWebAppData=...` to the Mini App URL when opening it. React's `HashRouter` interprets everything after `#` as the route path. The result: instead of routing to `/` (home), the app routes to a nonexistent path like `/tgWebAppData=query_id%3D...`, showing a blank screen or 404 component.

## Key Points

- Telegram injects `#tgWebAppData=<encoded_initData>` into the URL when opening a Mini App
- `HashRouter` uses `window.location.hash` for routing — sees `tgWebAppData=...` as the route
- `BrowserRouter` uses `window.location.pathname` and is unaffected — but requires server-side SPA fallback
- Fix for `HashRouter`: strip Telegram's hash fragment in `main.tsx` BEFORE mounting React
- The cleanup must happen before `createRoot()` / `ReactDOM.render()` — after mount is too late

## Details

React Router's `HashRouter` stores the current route in the URL hash fragment (`#/path`). When a user navigates to `/rides`, the URL becomes `https://app.domain.com/#/rides`. The router reads `window.location.hash`, strips the `#`, and matches against defined routes.

Telegram's Mini App WebView appends initialization data to the URL hash:
```
https://app.domain.com/#tgWebAppData=query_id%3DAAAA...%26user%3D%7B%22id%22%3A123...
```

When `HashRouter` initializes, it reads this hash and attempts to match `/tgWebAppData=query_id%3DAAAA...` against the route table. No route matches → the app renders a 404 page or blank screen.

The fix is a hash cleanup step in `main.tsx` that runs before React mounts:

```typescript
// main.tsx — BEFORE createRoot()
if (window.location.hash.includes("tgWebAppData")) {
  // Preserve any real hash route that might precede tgWebAppData
  const hash = window.location.hash;
  const cleanHash = hash.split("tgWebAppData")[0].replace(/[#&?]$/, "") || "#/";
  window.history.replaceState(null, "", cleanHash);
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

An alternative is migrating to `BrowserRouter`, which uses `pathname` instead of `hash` and is completely unaffected by Telegram's hash injection. However, `BrowserRouter` requires the server (Caddy) to return `index.html` for all routes — a SPA fallback configuration. The Poputchiki Caddyfile already includes `try_files {path} /index.html`, making this migration feasible as a future improvement.

The `tgWebAppData` hash is also used by `@telegram-apps/sdk` to extract `initData` for authentication. The cleanup must preserve the data before stripping it — either by parsing it into a variable first, or by relying on the SDK's own initialization which reads the data before DOM manipulation.

## Related Concepts

- [[concepts/telegram-desktop-miniapp-url-cache]] - Another Telegram-specific frontend gotcha; URL caching compounds with hash routing issues
- [[concepts/x-frame-options-telegram-embedding]] - Telegram Mini App embedding requirements that affect frontend configuration
- [[concepts/vite-api-base-env-var]] - Frontend build configuration for Telegram Mini App deployment

## Sources

- [[daily/2026-05-13.md]] - Session 21:14: Telegram Desktop appends `#tgWebAppData=...` to URL → HashRouter sees it as route → blank screen; fix: strip Telegram hash in `main.tsx` before React mount
