---
title: "Telegram Desktop Caches Mini App URL After BotFather Change"
aliases: [telegram-url-cache, botfather-url-cache, miniapp-url-cache, telegram-desktop-cache]
tags: [telegram, frontend, gotcha, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Telegram Desktop Caches Mini App URL After BotFather Change

Telegram Desktop caches the Mini App URL set in BotFather's Menu Button configuration. After updating the URL in BotFather, Telegram Desktop continues opening the old URL until the client is fully restarted. This creates a post-deploy invisible failure: the server is correctly configured but the user sees the old (broken) app.

## Key Points

- BotFather "Menu Button URL" change propagates to Telegram servers immediately
- Telegram Desktop caches the old URL locally — closing and reopening the chat is NOT sufficient
- Full Telegram Desktop restart required: quit the application completely and relaunch
- Mobile Telegram (iOS/Android) may also cache but typically refreshes faster
- The stale URL produces a confusing symptom: deploy succeeded, server healthy, but user sees old/broken page

## Details

During the Poputchiki production deployment on 2026-05-13, the Menu Button URL in BotFather was updated from the root domain to the `app.` subdomain (`app.poputchiki.searchingforgamesforever.online`). The server was correctly deployed and smoke tests passed. However, when opening the bot in Telegram Desktop, the Mini App loaded from the old URL — which either showed a blank page or a stale version of the application.

The caching behavior is in Telegram's native client, not in a browser or CDN. Telegram Desktop stores Mini App configuration (including the URL) in its local state. This cache is not invalidated when BotFather updates the configuration on Telegram's servers. The mismatch persists until the client fetches fresh configuration, which happens on full restart.

Debug sequence:
1. Updated BotFather Menu Button URL
2. Opened bot in Telegram Desktop → old URL loaded
3. Closed chat, reopened → still old URL
4. Killed Telegram Desktop process completely, relaunched → new URL loaded correctly

This is particularly deceptive in a deployment context because: (a) server-side smoke tests pass, (b) the BotFather configuration shows the correct URL, (c) the Telegram mobile app may work while Desktop doesn't, and (d) the developer testing may have the old URL cached while a fresh user would see the correct one.

For production deployments that change the Mini App URL, the deployment checklist should include: "After BotFather URL update, verify by opening the bot in a fresh Telegram session (or after full client restart)."

## Related Concepts

- [[connections/post-deploy-invisible-failures]] - Telegram URL cache is one of three invisible post-deploy failures discovered in sequence
- [[concepts/vite-api-base-env-var]] - Co-occurring issue: even after URL cache is cleared, hardcoded API path in frontend caused next failure layer
- [[concepts/x-frame-options-telegram-embedding]] - Another Telegram-specific deployment gotcha that prevents the Mini App from loading

## Sources

- [[daily/2026-05-13.md]] - Session 20:28: BotFather URL updated but Telegram Desktop kept loading old URL; full client restart required; discovered as first layer of invisible post-deploy failure chain
