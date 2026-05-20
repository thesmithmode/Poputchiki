---
title: "Telegram Bot 403 on First Message Permanently Disables Notifications"
aliases: [bot-403-notify-disabled, telegram-bot-first-message, notify-disabled-permanent, telegram-bot-start-required]
tags: [telegram, notifications, backend, bug, gotcha]
sources:
  - "daily/2026-05-18.md"
created: 2026-05-18
updated: 2026-05-18
---

# Telegram Bot 403 on First Message Permanently Disables Notifications

When the Poputchiki bot tries to send a message to a user who has never started the bot (`/start`), Telegram returns HTTP 403 ("Forbidden: bot can't initiate conversation"). If the error handler marks `notify_disabled = true` immediately on this 403, that user's Telegram notifications are permanently disabled — even though they would work fine if the user had started the bot.

## Key Points

- Telegram Bot API rule: bots cannot initiate a private conversation; user must first send `/start` to the bot
- A new user registers in Poputchiki before ever opening the bot in Telegram → first `sendMessage` attempt → 403
- If the error handler sets `notify_disabled = true` on any 403 → user never receives Telegram notifications even after starting the bot
- The correct behaviour: on 403, mark the user as pending re-enable (`notify_disabled = true`) BUT provide a `/start` re-enable flow that resets `notify_disabled = false` when the user eventually starts the bot
- SSH prod-check on 2026-05-18 confirmed: 2 users in DB, both `notify_disabled = false` → the fix was applied correctly OR the users had already started the bot

## Details

Telegram requires that users initiate a private conversation with a bot before the bot can send them messages. The flow for a Telegram Mini App is: the user opens the Mini App (which does not count as starting the bot), registers, and may never send `/start` to the bot separately. The bot therefore cannot reach new users via direct message until the user explicitly starts it.

The failure mode:

```
User registers → bot attempts sendMessage on first notification trigger
→ Telegram API: 403 Forbidden (user hasn't started bot)
→ Error handler: UPDATE users SET notify_disabled = true WHERE id = $userId
→ Future notifications: skipped because notify_disabled = true
→ User starts bot a week later: notify_disabled is still true
→ User never receives bot notifications
```

This was identified as the primary suspected cause of "бот не шлёт" reports — the bot silently disabled itself for the user on the first failed delivery attempt, and there was no recovery path.

**Correct architecture — re-enable flow:**

1. On 403 from sendMessage: set `notify_disabled = true` (correct — don't retry until user starts bot)
2. Bot webhook handler for `/start` command: `UPDATE users SET notify_disabled = false WHERE tg_id = $tgId`
3. Optionally: send a welcome message confirming notifications are now enabled

The `/start` handler must be registered in the webhook service. It runs whenever a Telegram user sends `/start` to the bot. If the user starts the bot after receiving a in-app notification about missing bot notifications (or via a Telegram call-to-action), the `notify_disabled` flag is reset and subsequent events begin delivering.

The secondary implication: any bot error that results in permanent `notify_disabled = true` — not just 403, but also 400 (bad request, malformed payload), 429 (rate limited), or network errors — should be handled with nuance. Only 403 (user blocked bot) and 403-related "blocked by user" errors warrant a permanent flag. Transient errors (5xx, timeouts) should be retried without setting the flag.

**Production verification on 2026-05-18:** `psql SELECT` on prod showed 2 registered users, both with `notify_disabled = false`. This meant either (a) both users had previously started the bot, or (b) the re-enable fix had already been applied correctly in a prior session. No immediate remediation needed.

## Related Concepts

- [[concepts/pg-notify-missing-user-notifications]] — Separate notification gap: even with `notify_disabled = false`, in-app feed was empty because pg_notify call sites skipped the DB INSERT
- [[concepts/enqueue-notification-helper]] — The helper that standardises notification dispatch; its interaction with `notify_disabled` flag should be: check flag before calling pg_notify
- [[concepts/hono-onerror-required]] — Server-side error handling: Telegram API errors must be caught and handled without crashing the notification path

## Sources

- [[daily/2026-05-18.md]] — Session 14:33: audit identified TG bot 403 on first sendMessage as primary suspected cause of "bot not sending"; sets notify_disabled=true permanently without re-enable path; /start webhook must reset the flag; prod psql check confirmed both existing users have notify_disabled=false
