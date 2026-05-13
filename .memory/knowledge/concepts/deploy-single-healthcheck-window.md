---
title: "Deploy Script Single Timeout Window — False Rollback Risk"
aliases: [deploy-healthcheck-timeout, single-timeout-all-services, false-rollback-slow-start]
tags: [deployment, docker, gotcha, infra, deploy-script]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Deploy Script Single Timeout Window — False Rollback Risk

A deploy script that applies one shared timeout window to verify all services become healthy will trigger false rollbacks when any single service starts slower than expected. Services in the same compose stack have vastly different startup times — combining them into a single deadline guarantees occasional false rollbacks.

## Key Points

- Poputchiki `deploy.sh` used a 60s window for all 5 services (api, notifier, cron, webhook, web-server)
- Lightweight services (Traefik, Caddy) become healthy in < 10s; heavy services (notifier, cron) may take > 30s on cold start
- If any service exceeds the deadline, deploy triggers rollback even if all services would eventually become healthy
- False rollbacks are especially dangerous in prod: each rollback itself takes time and may obscure the real deploy state
- Fix: staged per-service timeouts, or `docker compose up -d --wait --timeout <N>` with generous per-service deadlines

## Details

Docker Compose's `--wait` flag waits until all services pass their configured healthchecks, but applies a single global timeout (`--timeout N` seconds). A deploy script that does `docker compose up -d --wait --timeout 60` fails if even one service takes more than 60 seconds to become healthy — regardless of whether the service is critical or would have recovered on its own.

The asymmetry in startup times is fundamental to microservice stacks. Stateless services that don't wait for external dependencies (web server, reverse proxy) start in seconds. Services that wait for a PostgreSQL connection pool to warm up, load configuration from the database, or process pending work on startup (notifier processing pending notifications, cron registering scheduled jobs) can legitimately take 30-90 seconds on a cold start or after a container restart following a node reboot.

Failure scenario: notifier container takes 45 seconds to start (plausible during first start after volume rebuild). Deploy script times out at 60s with api (10s), webhook (12s), and web-server (8s) all healthy, but notifier not yet passing its healthcheck. Rollback fires. Next attempt hits the same issue unless the root cause is diagnosed.

**Mitigations:**

```bash
# Option 1: generous global timeout (blunt but simple)
docker compose up -d --wait --timeout 180

# Option 2: staged per-service health check
docker compose up -d --wait --timeout 30 postgres traefik web-server
docker compose up -d --wait --timeout 90 api webhook
docker compose up -d --wait --timeout 180 notifier cron

# Option 3: manual polling with per-service thresholds
for service in api webhook web-server; do
  timeout 45 bash -c "until docker compose ps $service | grep -q healthy; do sleep 3; done"
done
for service in notifier cron; do
  timeout 180 bash -c "until docker compose ps $service | grep -q healthy; do sleep 5; done"
done
```

Option 2 is the most operationally transparent — startup is staged and each stage has a meaningful deadline. The staged approach also exposes which layer failed (database vs application vs background workers) rather than just "something didn't start in time."

A secondary consideration: the healthcheck `interval` and `retries` defined in docker-compose.yml affect how quickly Docker Compose considers a service healthy. A healthcheck with `interval: 30s, retries: 3, start_period: 30s` can take up to 120 seconds before declaring unhealthy — longer than the deploy timeout. Tuning healthcheck parameters alongside the deploy timeout is part of the complete fix.

## Related Concepts

- [[concepts/deployment-pipeline]] - deploy.sh where the single timeout window was identified as a code review finding
- [[concepts/reactive-deploy-fix-loop]] - False rollbacks from timing issues contribute to the deploy fix loop; a too-tight timeout creates false failures indistinguishable from real ones
- [[concepts/healthcheck-process-vs-application]] - What the healthcheck tests matters too; a fast-passing process-level check may make service appear healthy before application is ready
- [[concepts/docker-compose-run-skips-healthcheck]] - Related compose timing issue: `run` ignores health conditions entirely; `up --wait` respects them but needs adequate per-service timeout

## Sources

- [[daily/2026-05-13.md]] - Session 19:16 code review finding #4: 60s single timeout window for all 5 services; Traefik/Caddy start < 10s; notifier/cron may take > 30s; risk: false rollback during slow cold starts; staged per-service timeouts as recommended fix
