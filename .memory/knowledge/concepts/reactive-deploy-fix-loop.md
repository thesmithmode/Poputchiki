---
title: "Reactive Deploy Fix Loop — Pre-Deploy Static Audit"
aliases: [reactive-deploy-loop, deploy-fix-loop, pre-deploy-audit, 15-failed-deploys]
tags: [deployment, discipline, workflow, gotcha]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# Reactive Deploy Fix Loop — Pre-Deploy Static Audit

The reactive deploy loop — push → fail → diagnose → fix one thing → push → fail on next thing — burned 15+ deployment attempts and hours of debugging on 2026-05-13. The correct discipline is a comprehensive static audit of the entire deployment stack before the first deploy attempt.

## Key Points

- 15 failed deployments in one day, each discovering one new problem that was fixable without deploying
- Root cause: no pre-deploy audit checklist; each failure was addressed reactively
- Correct approach: before first deploy, audit ALL compose env vars vs env.ts schema, ALL healthcheck endpoints vs router definitions, ALL Dockerfile COPY paths, ALL network-dependent operations for retry logic
- Same anti-pattern as reactive CI fix loops (push→fail→fix→push) but with higher cost: each deploy cycle = GHCR build + SSH + docker pull + container restarts = 5-15 minutes
- Prevention: static pre-deploy audit is cheaper than one failed deploy attempt

## Details

On 2026-05-13, the Poputchiki first production deployment encountered a cascade of failures, each discovered only after the previous one was fixed and a new deploy attempted:

1. `node-pg-migrate --envPath .env` → `dotenv` not installed in Docker image (env already injected by Docker)
2. `dotenv` added → but `dotenv-expand` also needed → another fix, another deploy
3. `dotenv-expand` added → postgres not accepting TCP connections (custom `config_file` nullified `listen_addresses`)
4. `listen_addresses = '*'` added → `pg_hba.conf` rejecting Docker-network IPs
5. `pg_hba.conf` mounted → `POSTGRES_DB` not creating database (existing volume)
6. Database created manually → init scripts not running (existing volume)
7. Init scripts applied → `caddy:2-alpine` missing `wget` for healthcheck
8. `wget` added → Caddyfile `encode zstd br gzip` → Brotli not available in Alpine
9. Brotli removed → Traefik v3.3 Docker client API 1.24 incompatible with Docker daemon 29.4.3
10. Traefik updated to `latest` → GHCR login timeout (transient)
11-15. Various retry/timing issues with docker pull, rollback script paths, notify-admin.sh relative paths

Each of these was discoverable without deploying:
- **env vars**: compare `docker-compose.prod.yml` env section against `apps/*/src/env.ts` schemas
- **healthcheck commands**: verify the binary exists in the image (`docker run --rm image which wget`)
- **Caddyfile modules**: check Alpine Caddy's built-in modules vs config requirements
- **Traefik compatibility**: check `docker version` on server vs Traefik image's Docker client version
- **postgres config**: read custom `postgresql.conf` and verify all critical settings are present
- **init scripts**: check if data volume exists on server before deploying

The pre-deploy audit checklist:

1. **Env vars**: every compose env var has a source (GitHub Secret, `.env`, hardcoded) and matches the app's expected schema
2. **Healthcheck commands**: every healthcheck binary (`curl`, `wget`, `pg_isready`) exists in the target image
3. **Healthcheck endpoints**: every healthcheck URL (`/health`, `/`) has a matching route in the app
4. **Dockerfile COPY paths**: every file copied exists in the build context
5. **Network retry**: every external network call (GHCR login, docker pull, DNS resolution) has retry logic
6. **Volume state**: check if data volumes exist on the target server; if so, plan for init-script-not-running scenario
7. **Base image compatibility**: verify Docker client/server API compatibility for orchestration tools (Traefik, monitoring)
8. **Entrypoints**: every service's `Dockerfile CMD` / compose `command` starts the correct process with correct args
9. **Script paths**: all scripts use absolute paths or `$STATE_DIR`-relative paths, not relative to CWD

## Related Concepts

- [[concepts/batch-ci-fix-discipline]] - Same anti-pattern applied to CI: reactive push→fail→fix loop; solution is also "collect full surface before acting"
- [[concepts/deployment-pipeline]] - The deploy pipeline where these failures occurred
- [[concepts/docker-healthcheck-curl]] - Several healthcheck failures were part of the cascade
- [[concepts/postgres-custom-config-nullifies-defaults]] - PostgreSQL config failures were part of the cascade

## Sources

- [[daily/2026-05-13.md]] - Sessions 14:43, 15:15, 15:30, 16:48: 15 sequential deployment failures across 4 sessions; each session fixed 2-4 issues reactively; audit checklist derived from the accumulated failure surface; specific failures: dotenv in Docker, listen_addresses, pg_hba, POSTGRES_DB on existing volume, caddy wget, Brotli, Traefik API version, GHCR timeout, docker pull retry, rollback.sh relative paths
