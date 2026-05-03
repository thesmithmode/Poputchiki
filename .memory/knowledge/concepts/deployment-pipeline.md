---
title: "Deployment Pipeline (GHA → GHCR → SSH → Docker Compose)"
aliases: [deploy, ci-cd, github-actions-deploy]
tags: [devops, deployment, ci-cd]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Deployment Pipeline (GHA → GHCR → SSH → Docker Compose)

Poputchiki is deployed via a GitHub Actions workflow that builds Docker images, pushes to GHCR, then SSHes into the production server and runs the deploy script.

## Key Points

- Workflow file: `.github/workflows/deploy.yml`
- Flow: GHA build → push images to GHCR → SSH to server → `scripts/deploy.sh ${SHA}`
- Deploy script: backup pre-deploy → run migrations → `docker compose up -d` → smoke `/health` → rollback on failure
- Any rollback uses `scripts/rollback.sh` only — no manual `docker compose down` on production
- Domain: `poputchiki.searchingforgamesforever.online` with subdomains `app.`, `api.`, `webhook.`

## Details

The production server runs Traefik as a reverse proxy with Let's Encrypt for TLS termination. Services are `api`, `notifier`, `cron`, `webhook`, `web-server`, `postgres`, and `nominatim`. An optional observability stack (Prometheus + Grafana + Uptime Kuma) can be composed in. Error tracking is either Sentry self-hosted (Plan A) or an `error_log` table with admin Telegram alerts (Plan B).

The `dev` branch is the autonomous push target. `main` is protected — no push without explicit instruction from Anton. A PreToolUse hook blocks `git push origin main` at the shell level.

The `phase=prod-deploy` tasks (TASK-115..125) cover all deployment automation tasks and are not started until all `phase=mvp` tasks are complete.

## Related Concepts

- [[concepts/poputchiki-stack]] - Services being deployed
- [[concepts/self-hosted-postgres]] - Database container in the compose stack
- [[concepts/tasks-json-management]] - prod-deploy phase task ordering

## Sources

- [[daily/2026-05-01.md]] - Deploy pipeline documented as part of architecture revision; domain confirmed; rollback script requirement noted
