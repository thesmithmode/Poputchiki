---
title: "docker compose run Ignores depends_on Health Checks"
aliases: [compose-run-no-healthcheck, docker-compose-run-depends, compose-run-vs-up, compose-wait]
tags: [docker, gotcha, infra, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# docker compose run Ignores depends_on Health Checks

`docker compose run` starts dependent services but does not wait for their healthcheck to pass. If a migration step uses `docker compose run api migrate`, it may execute before postgres is ready to accept connections, even if the compose file declares `depends_on: postgres: condition: service_healthy`.

## Key Points

- `docker compose run <service> <command>` starts dependencies but ignores `condition: service_healthy`
- `docker compose up -d --wait <service>` respects healthcheck conditions — use this to ensure readiness
- Correct migration pattern: `docker compose up -d --wait postgres && docker compose run api migrate`
- The `--wait` flag blocks until all target services pass their healthchecks
- Without `--wait`, migrations can fail with connection refused even though postgres will be ready seconds later

## Details

Docker Compose has two main ways to start services: `up` and `run`. The `up` command starts services according to the full lifecycle defined in the compose file, including `depends_on` conditions with health checks. The `run` command is designed for one-off commands against a service — it starts the service's dependencies but treats `depends_on` as a startup ordering hint, not a readiness gate.

In practice, when `deploy.sh` runs `docker compose run --rm api bun run migrate`, Docker Compose starts the postgres container first (because of `depends_on`), then immediately starts the migration command. If postgres takes 5-10 seconds to become ready (initializing shared memory, running recovery, etc.), the migration fails with `ECONNREFUSED` or `the database system is starting up`.

The fix in deploy scripts is to explicitly wait for postgres before running migrations:

```bash
# WRONG: starts postgres but doesn't wait for healthy
docker compose run --rm api bun run migrate

# CORRECT: wait for postgres to be healthy, then migrate
docker compose up -d --wait postgres
docker compose run --rm api bun run migrate
```

The `--wait` flag was added in Docker Compose v2.1 and blocks until the container's healthcheck reports "healthy". Combined with a proper healthcheck (`pg_isready -h 127.0.0.1 -U $POSTGRES_USER`), this ensures migrations only run when postgres is actually accepting TCP connections.

An alternative is to add retry logic to the migration command itself, but this pushes infrastructure concerns into application tooling. The `--wait` approach keeps the concern at the orchestration layer where it belongs.

## Related Concepts

- [[concepts/pg-isready-tcp-vs-unix-socket]] - The healthcheck that `--wait` relies on must test TCP, not Unix socket
- [[concepts/deployment-pipeline]] - Deploy script where migration ordering matters
- [[concepts/postgres-volume-init-idempotency]] - Init scripts and DB creation must also complete before migrations run

## Sources

- [[daily/2026-05-13.md]] - Session 15:15: `docker compose run` didn't wait for postgres healthy → migration ECONNREFUSED; fix: `docker compose up -d --wait postgres` before running migrations
