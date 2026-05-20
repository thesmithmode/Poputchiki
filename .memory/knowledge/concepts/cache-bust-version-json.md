---
title: "Cache-Bust via version.json + VITE_BUILD_SHA + visibilitychange"
aliases: [version-json-cache-bust, vite-build-sha, cache-bust-pattern, visibility-reload, app-update-detection]
tags: [frontend, deployment, vite, pattern, telegram]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Cache-Bust via version.json + VITE_BUILD_SHA + visibilitychange

A lightweight mechanism to force Telegram WebView users onto the latest app version after a deploy: the build pipeline embeds the git SHA in the bundle at compile time and writes a `version.json` file; a `useVersionCheck` hook fetches `version.json` on `visibilitychange: visible` and reloads the page if the SHA differs. This solves the in-process WebView bundle cache problem without requiring users to restart Telegram.

## Key Points

- Problem: Telegram WebView caches the JS bundle in-memory; after deploy, old code runs until Telegram process restarts
- `VITE_BUILD_SHA=${GITHUB_SHA}` Docker build ARG → Vite inlines the SHA at build time → bundle knows its own version
- Server writes `version.json` with the same SHA on each deploy; Caddy serves it with `Cache-Control: no-store`
- `useVersionCheck` hook: on `visibilitychange: visible` → fetch `version.json` (no cache) → compare SHA → if mismatch, `window.location.reload()`
- Reload happens at a natural transition (user returns to app), not mid-session — avoids interrupting active use
- No polling required; no background network traffic when app is not visible

## Details

The full mechanism has four components that must be implemented together:

**1. Docker build ARG in deploy.yml:**
```yaml
# .github/workflows/deploy.yml
- name: Build web image
  run: |
    docker build \
      --build-arg VITE_BUILD_SHA=${{ github.sha }} \
      -t ghcr.io/thesmithmode/poputchiki/web:${{ github.sha }} \
      apps/web-server/
```

**2. Dockerfile passes ARG to ENV:**
```dockerfile
# apps/web-server/Dockerfile
ARG VITE_BUILD_SHA
ENV VITE_BUILD_SHA=${VITE_BUILD_SHA}
RUN bun run build
```

Vite inlines `import.meta.env.VITE_BUILD_SHA` at build time — it becomes a string literal in the bundle, not a runtime env lookup.

**3. Generate version.json during deploy:**
```bash
# scripts/deploy.sh
echo "{\"sha\": \"${DEPLOY_SHA}\"}" > /var/www/html/version.json
```

Or via Vite's `vite-plugin-static-copy` / `generateBundle` hook to include it in the build output automatically.

**4. Caddyfile — no-cache for version.json only:**
```
handle /version.json {
  header Cache-Control "no-store, no-cache, must-revalidate"
  file_server
}
```

The JS bundle itself keeps aggressive caching (Vite uses content-hashed filenames like `index.a3f8bc.js`); only `version.json` bypasses cache.

**5. useVersionCheck hook (web/src/hooks/useVersionCheck.ts):**
```typescript
const BUILD_SHA = import.meta.env.VITE_BUILD_SHA ?? "dev";

export function useVersionCheck() {
  useEffect(() => {
    if (BUILD_SHA === "dev") return; // skip in local dev

    const check = async () => {
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const { sha } = await res.json();
        if (sha && sha !== BUILD_SHA) {
          window.location.reload();
        }
      } catch {
        // version check is non-critical — silent failure is fine
      }
    };

    const handler = () => {
      if (document.visibilityState === "visible") check();
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}
```

**6. Wire into App.tsx or main.tsx:**
```typescript
// web/src/App.tsx
export function App() {
  useVersionCheck();
  // ... rest of app
}
```

**Design tradeoffs:**
- `visibilitychange` vs polling: polling requires background network activity and can interrupt mid-use; visibilitychange is zero-cost when app is hidden and fires at a natural context-switch
- Reload vs soft update: `window.location.reload()` is blunt but simple; a soft update (re-fetching routes without full reload) would preserve scroll position but adds complexity
- `no-store` vs short TTL: `no-store` ensures every visibilitychange fetches from origin; a 30s TTL would reduce server load at the cost of a 30s detection delay

**Implementation status (2026-05-19):** Partially implemented — `VITE_BUILD_SHA` in Dockerfile and deploy.yml, `version.json` generation in deploy script. Pending: Caddyfile no-cache rule, `useVersionCheck` hook, wiring into App.tsx.

## Related Concepts

- [[concepts/tg-webview-inprocess-cache]] — The root problem this mechanism solves: Telegram WebView caches the bundle in-memory across Mini App opens
- [[concepts/vite-api-base-env-var]] — `VITE_API_BASE` follows the same Docker build ARG → Vite inline pattern; `VITE_BUILD_SHA` is the second variable using this mechanism
- [[concepts/telegram-desktop-miniapp-url-cache]] — Different cache layer: BotFather URL cache needs a Telegram Desktop restart; in-process bundle cache is what version.json solves

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: cache-bust механизм: паузирован частично (Dockerfile VITE_BUILD_SHA + version.json); ждёт: Caddyfile no-cache для /version.json, `useVersionCheck` хук (visibilitychange → fetch /version.json → reload на SHA mismatch), wire в main.tsx/App.tsx; причина: TG WebView кэшировал старый бандл
