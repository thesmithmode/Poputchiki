---
title: "X-Frame-Options DENY Breaks Telegram WebApp Embedding"
aliases: [x-frame-options-telegram, telegram-webapp-iframe, frame-options-miniapp]
tags: [security, telegram, frontend, gotcha, caddy]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-13
---

# X-Frame-Options DENY Breaks Telegram WebApp Embedding

Setting `X-Frame-Options: DENY` on the web-server's Caddy response headers prevents the application from being embedded in any iframe. Telegram Mini Apps are rendered inside Telegram's native WebView as an embedded frame — `X-Frame-Options: DENY` blocks this embedding entirely, making the app unusable as a Mini App.

## Key Points

- `X-Frame-Options: DENY` blocks all iframe/frame embedding, including Telegram's WebView container
- Telegram Mini Apps run inside a native Telegram WebView that behaves like an embedded frame
- Wrong header produces blank screen or load error inside Telegram — no JS errors, just nothing
- Correct approach: omit `X-Frame-Options` entirely, or use `Content-Security-Policy: frame-ancestors` with Telegram origins
- Discovered as a release blocker in the 2026-05-08 pre-production code review

## Details

The `X-Frame-Options` header controls whether a browser (or WebView) can render a page inside a `<frame>`, `<iframe>`, `<embed>`, or `<object>`. The three values are `DENY` (no frames), `SAMEORIGIN` (same-origin frames only), and `ALLOWALL`. For traditional web security, `DENY` is the strictest option and recommended for apps that should never be embedded.

Telegram Mini Apps are fundamentally embedded applications. The Telegram native app (iOS/Android) loads the Mini App URL in an embedded system WebView. The Telegram web client (`web.telegram.org`) loads it in an `<iframe>`. Both contexts expect the server to allow embedding. Setting `X-Frame-Options: DENY` causes WebView to refuse loading the page.

The fix for Caddy configuration:
```
# WRONG: blocks Telegram embedding
header X-Frame-Options DENY

# CORRECT option 1: remove X-Frame-Options entirely
# CORRECT option 2: use CSP with specific Telegram origins
header Content-Security-Policy "frame-ancestors 'self' https://web.telegram.org"
```

Using `Content-Security-Policy: frame-ancestors` with specific Telegram origins is the most secure option — it allows Telegram's web client while blocking arbitrary third-party embedding. `frame-ancestors` in CSP supersedes `X-Frame-Options` when both are present; modern browsers prefer CSP.

The native Telegram app (iOS/Android) uses a system WebView that may not enforce `X-Frame-Options` in the same way browsers do, but the security header still affects testing via the Telegram Web client and should be fixed regardless.

## Related Concepts

- [[concepts/poputchiki-stack]] - Poputchiki is a Telegram Mini App; Telegram WebView embedding is the primary delivery mechanism
- [[concepts/deployment-pipeline]] - Caddy config is part of `web-server` container; header fix deploys through docker compose update

## Sources

- [[daily/2026-05-08.md]] - Session 09:28: code review found `X-Frame-Options DENY` in Caddy config blocks Telegram iframe embedding; classified as release blocker; fix: remove header or use CSP `frame-ancestors` with `https://web.telegram.org`
