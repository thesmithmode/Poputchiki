---
title: "Poputchiki Tech Stack"
aliases: [poputchiki, stack, project-stack]
tags: [project, architecture, stack]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Poputchiki Tech Stack

Poputchiki is a Telegram MiniApp for carpooling residents of the ЖК Царёво residential complex. The project is fully self-hosted with no managed cloud services.

## Key Points

- **Backend**: TypeScript + Hono + Bun (monorepo: `apps/api`, `apps/notifier`, `apps/cron`, `apps/webhook`, `apps/web-server`)
- **Frontend**: TypeScript + Vite + React SPA, served by Caddy behind Traefik
- **Database**: Self-hosted PostgreSQL 16 in Docker (`postgres:16-alpine`) — no Supabase, no Neon
- **Auth**: Custom JWT (HS256) after HMAC-verification of Telegram `initData`; refresh-tokens with rotation via `revoked_tokens` table
- **Geocoding**: Self-hosted Nominatim (`mediagis/nominatim`) with Tatarstan region import

## Details

The project is structured as a Bun workspace monorepo. All services (api, notifier, cron, webhook, web-server) are Docker Compose microservices orchestrated via Traefik with Let's Encrypt on a customer's private server. The domain is `poputchiki.searchingforgamesforever.online` with subdomains `app.`, `api.`, and `webhook.`.

Realtime features use SSE via Hono + PostgreSQL `LISTEN/NOTIFY`, with a fallback to 30-second polling. Maps use Leaflet + OpenStreetMap without any API key. PII fields (phone, apartment number) are encrypted with `pgcrypto pgp_sym_encrypt`, with the key sourced from the `PGCRYPTO_KEY` environment variable.

The testing stack is Vitest (unit, integration, contract, security), Playwright (E2E), StrykerJS (mutation tests, nightly), and OWASP ZAP baseline (nightly). Linting and formatting use Biome.

## Related Concepts

- [[concepts/self-hosted-postgres]] - Database layer details and migration from Supabase
- [[concepts/rls-guc-identity]] - How RLS identity is enforced without Supabase auth functions
- [[concepts/deployment-pipeline]] - GHA → GHCR → SSH → docker compose deploy flow
- [[concepts/tasks-json-management]] - Autonomous task queue driving development

## Sources

- [[daily/2026-05-01.md]] - Architecture revised: full self-hosted stack documented, Supabase removed, 125-task roadmap established
