---
title: "Docker Healthcheck Curl Missing in Alpine Images"
aliases: [docker-healthcheck, curl-missing-alpine, bun-alpine-healthcheck, caddy-alpine-curl, caddy-wget-missing]
tags: [docker, deployment, gotcha, infra]
sources:
  - "daily/2026-05-08.md"
  - "daily/2026-05-13.md"
created: 2026-05-08
updated: 2026-05-13
---

# Docker Healthcheck Curl Missing in Alpine Images

`oven/bun:1-alpine` and `caddy:2-alpine` do not include `curl` in their base image. Docker Compose healthchecks that use `curl` commands will always fail, causing the container to be marked unhealthy and triggering the auto-rollback loop in the deploy pipeline on every deployment.

## Key Points

- `oven/bun:1-alpine` has no `curl` — `HEALTHCHECK CMD curl -f http://localhost:3000/health` fails immediately
- `caddy:2-alpine` has no `curl` for the same reason — stripped-down Alpine base
- Failing healthcheck → container never transitions from "starting" to "healthy" → deploy script treats it as failure → `scripts/rollback.sh` fires
- Fix options: (1) install `curl` via `RUN apk add --no-cache curl` in Dockerfile, (2) use `wget --spider` which is available in busybox Alpine, (3) use `CMD /usr/local/bin/bun -e "fetch(...).then(...)"` for Bun containers
- Discovered during full-project code review before production release: auto-rollback loop would fire on every deploy

## Details

The healthcheck failure pattern is silent at development time because `docker-compose.dev.yml` typically omits healthcheck configuration. Only when the production `docker-compose.prod.yml` is deployed does the missing `curl` surface. The deploy script waits for containers to become healthy before proceeding; when they never do, the rollback fires automatically.

For Bun-based services (`api`, `notifier`, `cron`, `webhook`), the two practical fixes are:
1. Add `RUN apk add --no-cache curl` to the Dockerfile — adds ~3MB but maintains familiar healthcheck syntax
2. Use `wget -q --spider http://localhost:3000/health || exit 1` — `wget` is part of BusyBox, present in all Alpine images

For Caddy (`web-server` container), `caddy:2-alpine` also lacks `wget` — confirmed during the 2026-05-13 production deployment where the Caddy healthcheck failed continuously. Fix: add `RUN apk add --no-cache wget` to the Caddy Dockerfile, then use `wget -q --spider http://localhost:80`. The earlier assumption that BusyBox `wget` is available in all Alpine images is incorrect for `caddy:2-alpine`.

Neither `curl` nor `wget` is guaranteed in all Alpine-based images — always verify with `docker run --rm <image> which wget` before relying on it in a healthcheck. If the healthcheck response body matters (e.g., checking for specific JSON), `curl` must be installed explicitly.

A related healthcheck gotcha: `pg_isready` without `-h` checks Unix socket, not TCP. In Docker, other containers connect via TCP — so a healthcheck that passes via Unix socket gives a false-healthy signal. Always use `pg_isready -h 127.0.0.1` for PostgreSQL healthchecks in Docker (see [[concepts/pg-isready-tcp-vs-unix-socket]]).

## Related Concepts

- [[concepts/deployment-pipeline]] - Deploy script waits for healthy status; failing healthcheck triggers auto-rollback
- [[concepts/poputchiki-stack]] - Container inventory: bun:1-alpine for api/notifier/cron/webhook; caddy:2-alpine for web-server
- [[concepts/pg-isready-tcp-vs-unix-socket]] - PostgreSQL-specific healthcheck gotcha: Unix socket vs TCP false-healthy
- [[concepts/postgres-custom-config-nullifies-defaults]] - Root cause of TCP not listening, which compounds with healthcheck tool issues

## Sources

- [[daily/2026-05-08.md]] - Session 09:28: code review found `oven/bun:1-alpine` and `caddy:2-alpine` lack `curl` → healthchecks fail → auto-rollback loop on every deploy; identified as release blocker
- [[daily/2026-05-13.md]] - Session 16:48: confirmed `caddy:2-alpine` also lacks `wget` (not just curl); fix: `RUN apk add --no-cache wget` in Caddy Dockerfile; part of 15-failure deployment cascade
