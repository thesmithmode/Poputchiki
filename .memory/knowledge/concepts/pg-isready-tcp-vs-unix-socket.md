---
title: "pg_isready Unix Socket vs TCP — False Healthy in Docker"
aliases: [pg-isready-tcp, pg-isready-unix-socket, postgres-healthcheck-tcp, false-healthy-postgres]
tags: [postgresql, docker, healthcheck, gotcha, infra]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# pg_isready Unix Socket vs TCP — False Healthy in Docker

`pg_isready` without the `-h` flag connects via Unix socket by default. In Docker Compose, other containers connect to postgres via TCP (hostname:port). When TCP listening is misconfigured but Unix socket works, `pg_isready` reports "healthy" while all TCP-based service connections fail with ECONNREFUSED.

## Key Points

- `pg_isready` without `-h` → connects via Unix domain socket (`/var/run/postgresql/.s.PGSQL.5432`)
- `pg_isready -h 127.0.0.1` → connects via TCP loopback — tests what other containers actually use
- Docker healthcheck `pg_isready -U $POSTGRES_USER` can return "accepting connections" while TCP port 5432 is unreachable from the Docker network
- The false-healthy signal causes Docker Compose to start dependent services (api, notifier) that immediately fail with connection errors
- Fix: always use `pg_isready -h 127.0.0.1 -U $POSTGRES_USER` in Docker healthcheck commands

## Details

PostgreSQL supports two connection methods: Unix domain sockets (local filesystem pipe) and TCP sockets (network). Unix sockets are faster and used by default when the client runs on the same host as the server. `pg_isready`, the standard PostgreSQL health check tool, defaults to Unix socket when no `-h` flag is provided.

In a Docker Compose environment, each service runs in its own container with its own network namespace. The postgres container's Unix socket is only accessible within the postgres container itself (unless explicitly volume-mounted to other containers, which is uncommon). All other containers connect via TCP using the service name (e.g., `postgres:5432`) resolved through Docker's internal DNS.

The failure scenario on 2026-05-13:
1. Custom `postgresql.conf` was missing `listen_addresses = '*'` → postgres only listened on Unix socket
2. Healthcheck `pg_isready -U postgres` connected via Unix socket → returned "accepting connections"
3. Docker Compose marked postgres as "healthy" and started dependent services
4. API container tried `postgres://postgres:password@postgres:5432/poputchiki` → TCP connection refused
5. API container crash-looped; deploy script detected unhealthy services and triggered rollback

The fix is two-fold: (1) ensure `listen_addresses = '*'` in postgresql.conf (see [[concepts/postgres-custom-config-nullifies-defaults]]), and (2) change healthcheck to `pg_isready -h 127.0.0.1 -U $POSTGRES_USER` so it tests TCP connectivity — the same method used by dependent services. If TCP is broken, the healthcheck correctly reports unhealthy, preventing premature service startup.

A subtler variant: `pg_isready -h localhost` may still use Unix socket on some configurations (if `localhost` resolves to a socket path in pg_hba.conf). Always use the explicit IP `127.0.0.1` to force TCP.

## Related Concepts

- [[concepts/postgres-custom-config-nullifies-defaults]] - Root cause: custom config_file removes listen_addresses default → TCP not listening
- [[concepts/docker-healthcheck-curl]] - Related Docker healthcheck gotchas: missing tools (curl/wget) in Alpine images
- [[concepts/deployment-pipeline]] - Deploy script relies on healthcheck accuracy to decide rollback vs proceed

## Sources

- [[daily/2026-05-13.md]] - Session 15:15: `pg_isready` without `-h` checked Unix socket → "healthy" while TCP ECONNREFUSED; fix: `-h 127.0.0.1` in healthcheck; combined with missing `listen_addresses` in custom config
