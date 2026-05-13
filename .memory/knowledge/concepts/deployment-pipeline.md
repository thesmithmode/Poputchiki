---
title: "Deployment Pipeline (GHA → GHCR → SSH → Docker Compose)"
aliases: [deploy, ci-cd, github-actions-deploy]
tags: [devops, deployment, ci-cd]
sources:
  - "daily/2026-05-01.md"
  - "daily/2026-05-08.md"
  - "daily/2026-05-13.md"
created: 2026-05-01
updated: 2026-05-13
---

# Deployment Pipeline (GHA → GHCR → SSH → Docker Compose)

Poputchiki is deployed via a GitHub Actions workflow that builds Docker images, pushes to GHCR, then SSHes into the production server and runs the deploy script.

## Key Points

- Workflow file: `.github/workflows/deploy.yml`
- Flow: GHA build → push images to GHCR → SSH to server → `scripts/deploy.sh ${SHA}`
- Deploy script: backup pre-deploy → run migrations → `docker compose up -d` → smoke `/health` → rollback on failure
- Any rollback uses `scripts/rollback.sh` only — no manual `docker compose down` on production
- Domain: `poputchiki.searchingforgamesforever.online` with subdomains `app.`, `api.`, `webhook.`
- `DATABASE_MIGRATOR_URL` must be explicitly passed to deploy pipeline — if missing, migrations run as app role (insufficient DDL rights) or fail silently
- Cron cleanup jobs must run as service role, not app role — app role is subject to RLS which blocks cross-user DELETEs

## Details

The production server runs Traefik as a reverse proxy with Let's Encrypt for TLS termination. Traefik must use `traefik:latest` — pinned `traefik:v3.3` uses Docker client API v1.24, which is incompatible with Docker daemon 29.4.3 (requires minimum v1.40). The API version mismatch causes Traefik to lose Docker service discovery entirely, preventing Let's Encrypt certificate issuance and breaking TLS handshakes through Cloudflare. Services are `api`, `notifier`, `cron`, `webhook`, `web-server`, `postgres`, and `nominatim`. An optional observability stack (Prometheus + Grafana + Uptime Kuma) can be composed in. Error tracking is either Sentry self-hosted (Plan A) or an `error_log` table with admin Telegram alerts (Plan B).

The `dev` branch is the autonomous push target. `main` is protected — no push without explicit instruction from Anton. A PreToolUse hook blocks `git push origin main` at the shell level.

The `phase=prod-deploy` tasks (TASK-115..125) cover all deployment automation tasks and are not started until all `phase=mvp` tasks are complete.

Key operational findings from the 2026-05-13 first production deployment: (1) `node-pg-migrate` with `--envPath .env` flag attempts to import `dotenv` package even in Docker where env is already injected — either remove the flag or add `dotenv` as a dependency. (2) GHCR login and `docker pull` on the server experience transient timeouts (`context deadline exceeded`) — all network calls in `deploy.sh` need retry logic (3 attempts, 15-30s between). (3) `scripts/rollback.sh` used relative path to `notify-admin.sh` — fails when called from a different CWD; fix: use `$STATE_DIR/scripts/notify-admin.sh`. (4) `docker compose run` does not wait for `depends_on: service_healthy` — must use `docker compose up -d --wait postgres` before running migrations. (5) TG deploy failure notifications go only to `ADMIN_TG_CHAT_ID`, not to regular users.

Two deployment gaps found in the 2026-05-08 pre-release review: (1) `DATABASE_MIGRATOR_URL` was not threaded through the deploy pipeline — migrations require elevated rights (DDL + GRANT) that the regular app role lacks; without a separate migrator URL, migrations fail or silently apply with insufficient privileges. (2) Cron cleanup jobs (deleting expired tokens, stale sessions, rate-limit rows) were executing as the `poputchiki_app` role, which is subject to RLS. RLS policies prevent cross-user DELETEs — the cleanup job saw 0 rows deleted because it had no `app.current_user_id` set and the USING clause filtered everything out. Fix: cron cleanup must use `SET ROLE poputchiki_service` or the migrator role that has `BYPASSRLS`.

## Related Concepts

- [[concepts/poputchiki-stack]] - Services being deployed
- [[concepts/self-hosted-postgres]] - Database container in the compose stack
- [[concepts/tasks-json-management]] - prod-deploy phase task ordering
- [[concepts/superuser-database-url-rls-bypass]] - DATABASE_URL role selection determines whether RLS applies to API queries; DATABASE_MIGRATOR_URL is the separate DDL-capable connection
- [[concepts/postgres-custom-config-nullifies-defaults]] - Custom postgresql.conf must include listen_addresses and hba_file explicitly
- [[concepts/docker-compose-run-skips-healthcheck]] - `docker compose run` ignores depends_on health — must `up -d --wait` first
- [[concepts/reactive-deploy-fix-loop]] - 15 failed deploys from reactive fix loop; pre-deploy static audit discipline

## Sources

- [[daily/2026-05-01.md]] - Deploy pipeline documented as part of architecture revision; domain confirmed; rollback script requirement noted
- [[daily/2026-05-08.md]] - Session 09:28: code review found `DATABASE_MIGRATOR_URL` not plumbed through deploy pipeline → migration failures; cron cleanup runs as app role → RLS blocks all DELETEs; both classified as release blockers
- [[daily/2026-05-13.md]] - Sessions 14:43–19:16: 15 failed production deploys; Traefik v3.3 Docker API incompatibility fixed with `traefik:latest`; node-pg-migrate dotenv issue; GHCR/docker pull transient timeouts need retry; rollback.sh relative path fix; `docker compose run` doesn't wait for healthy postgres
