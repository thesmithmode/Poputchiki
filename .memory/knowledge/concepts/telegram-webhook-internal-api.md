---
title: "Telegram Bot Callback Buttons Require Internal API Route + Webhook Env Vars"
aliases: [telegram-callback-internal, webhook-internal-api, tg-callback-route, internal-api-secret, telegram-inline-keyboard-callback]
tags: [telegram, backend, webhook, architecture, gotcha]
sources:
  - "daily/2026-05-19.md"
created: 2026-05-19
updated: 2026-05-19
---

# Telegram Bot Callback Buttons Require Internal API Route + Webhook Env Vars

Telegram inline keyboard "Accept/Reject" callback buttons (sent via TG bot) trigger `callback_query` webhook events that the webhook service must handle by calling the API. This requires two things that are often missed: (1) a dedicated `/internal/ride-requests` route in the API that accepts calls from the webhook service, and (2) `API_URL` and `INTERNAL_API_SECRET` environment variables in the webhook service's Docker compose configuration.

## Key Points

- TG inline keyboard button press → `callback_query` → webhook service receives → webhook calls internal API endpoint
- Double root cause on first failure: API missing `/internal/ride-requests` route AND webhook service missing `API_URL` / `INTERNAL_API_SECRET` env vars
- `/internal/*` routes are not user-facing — they are authenticated by `INTERNAL_API_SECRET` (shared secret between webhook and api), not by JWT
- `INTERNAL_API_SECRET` must be set in both `docker-compose.prod.yml` (as env) and as a GitHub Secret for the deploy pipeline
- Without `API_URL`, webhook service cannot call the API; without `INTERNAL_API_SECRET`, the internal route rejects the request as unauthorized

## Details

Telegram's inline keyboard allows the bot to send messages with clickable buttons. When a user clicks a button, Telegram sends a `callback_query` event to the configured webhook URL. The webhook service receives the event, parses the callback data (e.g., `accept:ride_request_id:123`), and must take action — in Poputchiki's case, calling the ride-requests accept endpoint.

The call chain:

```
Driver's Telegram client
  → clicks "Принять" (Accept) inline button
  → Telegram Bot API
  → POST https://webhook.poputchiki.domain/telegram
  → apps/webhook/src/handlers/callbackQuery.ts
  → POST http://api:3000/internal/ride-requests/accept
  → ridesRouter or rideRequestsRouter (internal route)
  → book_seat() + notify passenger
```

The two missing pieces that caused the 2026-05-19 failure:

**1. Missing internal route in API:** The `/internal/ride-requests` route was not defined. The webhook service was making a POST to an undefined path → 404 → callback silently failed. Fix: add the internal route with `INTERNAL_API_SECRET` verification middleware.

```typescript
// apps/api/src/routes/internal.ts
internalRouter.use("*", verifyInternalSecret); // checks Authorization: Bearer INTERNAL_API_SECRET
internalRouter.post("/ride-requests/accept", handleInternalAccept);
```

**2. Missing env vars in compose:** The webhook service's `docker-compose.prod.yml` entry was missing:

```yaml
webhook:
  environment:
    - API_URL=http://api:3000  # internal Docker network URL
    - INTERNAL_API_SECRET=${INTERNAL_API_SECRET}
    - BOT_TOKEN=${BOT_TOKEN}
```

Without `API_URL`, the webhook service had no way to know where to call the API. The env var was also missing from `deploy.yml` build args and from GitHub Secrets, so it was absent at all layers.

**Security note:** Internal routes must never be exposed through Traefik to the public internet. They are reachable only via Docker's internal network (service name resolution: `http://api:3000`). The `INTERNAL_API_SECRET` is a shared secret that the webhook service sends as a Bearer token; the API verifies it before processing any internal request. This prevents external actors from calling internal endpoints even if they somehow learn the internal URL.

## Related Concepts

- [[concepts/telegram-bot-403-notify-disabled]] — Another Telegram bot delivery failure mode; this article covers callback handling, not initial notification
- [[concepts/notifier-service-role-rls]] — Service processes calling the API or DB need special authentication; internal API calls use shared secret, not JWT
- [[concepts/deployment-pipeline]] — `INTERNAL_API_SECRET` must be a GitHub Secret and must be threaded through `deploy.yml` build/compose env vars; missing secrets are a common deploy failure mode

## Sources

- [[daily/2026-05-19.md]] — Session 14:44: TG "Принять" callback double root cause — API missing `/internal/ride-requests` route + webhook container missing `API_URL` + `INTERNAL_API_SECRET` env vars; fix: add internal route with secret verification, add env vars to compose and GitHub Secrets
