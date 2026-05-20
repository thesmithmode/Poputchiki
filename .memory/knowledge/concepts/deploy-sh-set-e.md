---
title: "deploy.sh Failsafe — set -euo pipefail and Concurrent Deploy Lock"
aliases: [deploy-sh-set-e, set-euo-pipefail, deploy-lock-flock, deploy-failsafe]
tags: [deployment, shell, infra, security, gotcha]
sources:
  - "daily/2026-05-20.md"
created: 2026-05-20
updated: 2026-05-20
---

# deploy.sh Failsafe — set -euo pipefail and Concurrent Deploy Lock

Without `set -euo pipefail`, a failed step in `deploy.sh` (e.g., a migration error) does not stop script execution. The deploy continues to `docker compose up`, starting containers with a broken or partially-migrated database schema. This is the most dangerous class of deploy failure: containers report healthy but data layer is inconsistent.

## Key Points

- `set -euo pipefail` must be the first non-comment line of every shell script in the deploy pipeline
  - `-e`: exit immediately on any command failure (non-zero exit code)
  - `-u`: treat unset variables as an error (catches `$MISSING_VAR` typos)
  - `-o pipefail`: a pipeline fails if any command in it fails (not just the last)
- Without `-e`: migration error → script continues → `docker compose up` starts → broken production
- Without `flock`: two parallel GHA deploy workflows (e.g., two pushes in quick succession) both SSH in and run `docker compose up` simultaneously → race condition on container state
- Postgres `mem_limit` absent: at 50k concurrent users, Postgres can exhaust all server RAM and trigger OOM-killer on sibling containers

## Details

A typical deploy script without error handling:

```bash
#!/bin/bash
# WRONG: missing set -euo pipefail

docker compose run --rm api bun run migrate   # if this fails...
docker compose up -d                           # ...this still runs
```

If the migration fails (syntax error, constraint violation, role missing), the script prints an error but continues. `docker compose up -d` starts the application containers. They connect to a database in an intermediate state — some migrations applied, others not. The application may crash on startup or, worse, silently produce incorrect results.

The correct header:

```bash
#!/bin/bash
set -euo pipefail

# Concurrent deploy protection
LOCK_FILE="/var/lock/poputchiki-deploy.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another deploy is running. Exiting."; exit 1; }

# Now safe to proceed
echo "Starting deploy: $DEPLOY_SHA"
```

`flock -n` attempts a non-blocking exclusive lock. If another deploy process holds the lock (e.g., from a previous GHA workflow that hasn't finished), the current script exits immediately with a clear message rather than racing.

**Postgres memory limit in docker-compose.prod.yml:**

```yaml
postgres:
  image: postgres:16-alpine
  mem_limit: 2g
  memswap_limit: 2g
  oom_kill_disable: false   # allow OOM killer to target postgres rather than other containers
  restart: unless-stopped
```

Without `mem_limit`, PostgreSQL's shared buffers and work_mem can grow unboundedly. At 50k concurrent users with complex join queries, Postgres can consume all available RAM, triggering the kernel OOM killer which may target any process on the host — including the API or notifier containers.

**GHA Docker layer caching (bonus optimization found in infra review):**

```yaml
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

Without GHA layer caching, each CI build rebuilds from scratch: 5–7 minutes per image. With caching, unchanged layers are reused: < 1 minute per image for typical code changes.

**CI gitleaks shallow clone:** The gitleaks job runs with `fetch-depth: 1` (shallow clone) — it only scans the tip commit, missing secrets in older history. For a complete scan: `fetch-depth: 0`.

## Related Concepts

- [[concepts/reactive-deploy-fix-loop]] — The anti-pattern this prevents: a failed migration continuing silently is the deploy equivalent of a reactive fix loop
- [[concepts/deployment-pipeline]] — deploy.sh is the core of the deployment pipeline; `set -euo pipefail` is the first safety gate
- [[concepts/docker-compose-run-skips-healthcheck]] — Related deploy script ordering: `run` vs `up --wait` for health-aware sequencing; both issues manifest in the same script

## Sources

- [[daily/2026-05-20.md]] — Session 19:45: sector-infra-review finding #1 CRITICAL: `deploy.sh` без `set -euo pipefail` → failed migration не останавливает деплой; finding #2 CRITICAL: postgres без `mem_limit` → OOM при 50k; finding: нет `flock` → параллельные деплои конкурируют; finding MEDIUM: GHA build без `cache-from: type=gha` → 5-7 минут вместо <1 минуты
