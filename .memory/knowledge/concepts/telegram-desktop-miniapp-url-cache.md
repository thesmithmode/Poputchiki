---
title: "Telegram Desktop Caches Mini App URL — Restart Required"
aliases: [telegram-miniapp-cache, botfather-url-cache, telegram-desktop-restart, miniapp-url-refresh]
tags: [telegram, miniapp, gotcha, deployment, testing]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Telegram Desktop Caches Mini App URL — Restart Required

Telegram Desktop aggressively caches the Mini App Menu Button URL set in BotFather. After updating the URL in BotFather, the old URL continues to open until Telegram Desktop is fully restarted. This is a client-side cache — the bot config on Telegram servers is updated immediately.

## Key Points

- BotFather `Menu Button URL` change takes effect on Telegram servers immediately
- Telegram Desktop (Windows/macOS) caches the previous URL in memory until restart
- Symptom: Mini App still opens old URL after BotFather change; mobile Telegram may reflect new URL before Desktop does
- Fix: fully quit and relaunch Telegram Desktop (not just close the chat window)
- Affects debugging/testing: if testing new deployment URL changes, budget time for a Telegram restart

## Details

Telegram Mini Apps are launched via a Menu Button configured in BotFather. The button URL is fetched once per session by Telegram clients and cached. Telegram Desktop (the native desktop client) is especially aggressive about this caching — it does not re-fetch the bot config when navigating back to the bot chat, or when the chat is reloaded.

In Poputchiki's 2026-05-13 deployment, the BotFather Menu Button URL was updated from the old form to `https://app.poputchiki.searchingforgamesforever.online`. After the change, Telegram Desktop continued opening the old URL. Smoke tests appeared to confirm the Mini App loaded, but it was actually loading a stale/incorrect URL. Only after quitting Telegram Desktop completely and relaunching did the new URL take effect.

The mobile Telegram client (iOS/Android) typically reflects BotFather configuration changes faster — often within seconds to a minute, sometimes requiring the bot chat to be closed and reopened. Mobile is more reliable as a test client immediately after BotFather changes.

**Testing workflow after BotFather URL change:**
1. Update URL in BotFather
2. Close Telegram Desktop completely (system tray → Quit, not just minimize)
3. Relaunch Telegram Desktop
4. Open bot chat and click Menu Button — now uses new URL
5. For faster iteration: use Telegram mobile as primary test client during deployment

This behavior is also relevant when switching between staging and production Mini App URLs, or when testing with a tunnel URL (e.g., ngrok) during development.

## Related Concepts

- [[concepts/x-frame-options-telegram-embedding]] — Related Telegram Mini App deployment gotcha: `X-Frame-Options: DENY` breaks the WebApp iframe before it even loads
- [[concepts/deployment-pipeline]] — BotFather URL update is a manual post-deploy step that must be included in deployment runbooks
- [[concepts/vite-api-base-env-var]] — Co-occurring issue on the same day: after fixing HTTPS (acme) and the BotFather URL, the Mini App loaded but API calls failed due to hardcoded API path

## Sources

- [[daily/2026-05-13.md]] — Session 20:28: BotFather Menu Button URL updated to `app.poputchiki.*`; Telegram Desktop continued showing old URL until full restart; mobile client reflected change faster; restart confirmed new URL working
