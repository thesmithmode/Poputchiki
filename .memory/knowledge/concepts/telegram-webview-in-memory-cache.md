---
title: "Telegram WebView In-Memory JS Bundle Cache — Persists Until Process Restart"
aliases: [telegram-webview-cache, webview-bundle-cache, tg-webview-in-memory, telegram-js-cache]
tags: [telegram, frontend, deployment, gotcha, debugging]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Telegram WebView In-Memory JS Bundle Cache — Persists Until Process Restart

Telegram's native WebView caches JS bundles and assets in memory for the duration of the Telegram process. This is distinct from the BotFather URL cache (which caches which URL to open). Even after the server deploys a new build, the WebView may continue serving old JS from its in-memory cache. The cache is cleared only when the Telegram process is fully killed and restarted — not by closing and reopening the chat, or even by restarting the Mini App.

## Key Points

- TG WebView in-memory cache ≠ BotFather URL cache — two separate caching layers
- BotFather URL cache: which URL to open (fixed by full Telegram restart)
- WebView JS cache: contents of the JS bundle at that URL (fixed by Telegram process kill + restart)
- Symptom: new deploy contains updated code, but prod visually shows old layout/behavior → wrong diagnosis: "code not deployed"
- Correct diagnosis: SSH to prod, grep the bundle for a unique string from the new code → confirms whether server has new code
- The in-memory cache survives: closing the Mini App, switching chats, swiping away the bot, even "Force Stop" on Android if the OS keeps the process alive

## Details

After a deploy that changed the UI layout (commit `d2784ef`), the production server correctly contained the new build. However, testers using Telegram saw the old design. The initial reaction was "the deploy didn't apply the new code," which was incorrect.

The correct diagnostic sequence:
1. SSH to prod: `grep -r "unique_new_css_class" /path/to/web/dist/` → found → server has new code
2. Conclusion: WebView cache is serving old JS bundle
3. Fix: kill Telegram process completely (not just swipe away) and restart

The distinction from the BotFather URL cache (`concepts/telegram-desktop-miniapp-url-cache`):
- **BotFather URL cache**: Telegram Desktop caches which URL the Mini App button opens. Clearing requires full Telegram restart. Applies even on first open after BotFather change.
- **WebView JS cache**: After the URL is opened correctly, the WebView may still serve a cached version of the JS files from that URL. This layer is independent — a correct URL can still show old JS.

In practice, both caches can be active simultaneously during a deploy that changes both the URL and the code. The debugging approach must address them separately:
1. Verify server has new code (SSH + grep bundle)
2. Force-restart Telegram to clear URL cache
3. If still old UI after restart, Telegram process may need a full OS-level kill

**Cache-busting mitigation (in progress for Poputchiki):** A `version.json` endpoint serving the current build SHA, checked on `visibilitychange` events, allows the app to detect stale bundles and trigger a reload. This partially mitigates the in-memory cache by prompting a fresh network fetch when the user switches back to the app.

## Related Concepts

- [[concepts/telegram-desktop-miniapp-url-cache]] — The URL-level caching layer; must be cleared first before the JS cache becomes diagnosable
- [[connections/telegram-webapp-invisible-constraints]] — Part of the broader pattern of Telegram-specific invisible deployment failures
- [[connections/post-deploy-invisible-failures]] — Both cache types create the same symptom: deploy succeeds server-side but user sees old app

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: prod showed old layout despite new code in commit d2784ef; diagnosed via SSH bundle grep — server had new code; root cause: TG WebView in-memory bundle cache; fix: full Telegram process kill; cache-bust via version.json + visibilitychange hook planned but not yet wired in
