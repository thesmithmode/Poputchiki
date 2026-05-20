---
title: "Telegram WebView In-Process Bundle Cache — Stale Code After Deploy"
aliases: [tg-webview-bundle-cache, telegram-inprocess-cache, webview-stale-bundle, tg-app-old-code]
tags: [telegram, deployment, frontend, gotcha, caching]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Telegram WebView In-Process Bundle Cache — Stale Code After Deploy

Telegram's native WebView caches the Mini App JavaScript bundle in-memory for the lifetime of the Telegram process. After a successful deploy, the server serves new code, but users who have Telegram open will continue running the old bundle until the Telegram process restarts. This is distinct from the BotFather URL cache — the URL is correct, but the old code is executing.

## Key Points

- BotFather URL cache (see [[concepts/telegram-desktop-miniapp-url-cache]]): wrong URL is loaded — resolved by Telegram Desktop full restart
- In-process bundle cache: correct URL is loaded, but the JavaScript bundle fetched earlier in the same Telegram session is reused — persists until the Telegram process itself restarts (not just the chat being closed)
- Closing and reopening the chat, or tapping the Mini App button again, does NOT clear the bundle cache
- Diagnostic: SSH to prod server, grep the deployed bundle file for a known new string; if it's present on the server but the user's screen shows old behaviour, the WebView is serving a cached bundle
- Mitigation: cache-bust via `version.json` + `visibilitychange` hook that forces reload when SHA changes

## Details

Telegram Desktop and mobile clients maintain an in-process WebView instance. When the Mini App opens for the first time in a session, the WebView fetches and executes the JavaScript bundle (`assets/index.[hash].js`). Subsequent opens within the same Telegram process reuse the already-executed bundle from the WebView's in-memory cache. This is standard WebView behaviour — any in-app browser does the same.

The consequence for deployment: after pushing a new build, users who haven't restarted Telegram see old code. The new code is on the server; Caddy serves it correctly; but the WebView never re-fetches it during the current Telegram session. Users report bugs that were already fixed in the latest commit.

**Diagnosis on 2026-05-19:** The app showed old ride card layout in Telegram despite `d2784ef` containing the new layout. SSH to prod:

```bash
# Check if new code is actually on the server
docker exec web-server cat /var/www/html/assets/index.*.js | grep -o 'RideCard.*{' | head -3
# If new layout string appears → server has new code → WebView is serving cached bundle
```

Finding the new layout string in the server bundle but old layout on-screen confirms in-process caching.

**Mitigation — `version.json` + `useVersionCheck` hook (partially implemented 2026-05-19):**

The deploy pipeline builds with `VITE_BUILD_SHA=${GITHUB_SHA}` and writes a small `version.json`:
```json
{ "sha": "d2784ef..." }
```

A `useVersionCheck` React hook:
```typescript
const BUILD_SHA = import.meta.env.VITE_BUILD_SHA;

export function useVersionCheck() {
  useEffect(() => {
    const check = async () => {
      const res = await fetch("/version.json", { cache: "no-store" });
      const { sha } = await res.json();
      if (sha !== BUILD_SHA) {
        window.location.reload(); // force reload to pick up new bundle
      }
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check();
    });
  }, []);
}
```

When the user switches away and back to Telegram (triggering `visibilitychange: visible`), the hook fetches `version.json` without cache. If the SHA differs from the compiled-in build SHA, it reloads the page — forcing the WebView to fetch the new bundle.

**Caddyfile — no-cache for version.json:**
```
handle /version.json {
  header Cache-Control "no-store"
  file_server
}
```

This ensures `version.json` is never served from a CDN or browser cache. The JS bundle itself can remain cached aggressively (Vite uses content-hashed filenames); only `version.json` must bypass cache.

The visibilitychange approach is chosen over polling because: (1) no background network traffic when the user isn't looking at the app; (2) the reload happens at a natural transition point (returning to the app) rather than interrupting active use.

## Related Concepts

- [[concepts/telegram-desktop-miniapp-url-cache]] — Different Telegram caching problem: BotFather URL cache causes the wrong URL to be opened; in-process bundle cache causes old code to run at the correct URL
- [[connections/telegram-webapp-invisible-constraints]] — Both caching issues are part of the pattern of invisible Telegram WebApp constraints
- [[concepts/vite-api-base-env-var]] — VITE_BUILD_SHA follows the same pattern as VITE_API_BASE: build-arg passed at Docker build time, Vite inlines at compile time

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: TG WebView in-memory cache caused "старого дизайна" on prod despite commit d2784ef containing new layout; diagnosed via SSH grep of bundle on server; cache-bust mechanism (version.json + VITE_BUILD_SHA + visibilitychange hook) partially implemented — Caddyfile no-cache + useVersionCheck hook wiring into main.tsx/App.tsx pending
