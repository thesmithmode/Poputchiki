---
title: "PostgreSQL Custom config_file Nullifies Image Defaults"
aliases: [postgres-config-file, listen-addresses-missing, pg-hba-docker-network, custom-postgresql-conf]
tags: [postgresql, docker, gotcha, infra, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# PostgreSQL Custom config_file Nullifies Image Defaults

Mounting a custom `postgresql.conf` via Docker's `config_file=` command flag overrides ALL default configuration from the `postgres:16-alpine` image — not just the values explicitly set in the custom file. Missing settings like `listen_addresses = '*'` and `hba_file` revert to PostgreSQL's compile-time defaults, which only allow localhost connections.

## Key Points

- `command: -c config_file=/etc/postgresql/postgresql.conf` replaces the entire default config, not just overridden keys
- Without `listen_addresses = '*'` in custom config → postgres listens only on Unix socket → TCP connections from Docker network (172.x) fail with ECONNREFUSED
- Without explicit `hba_file` pointing to a mounted `pg_hba.conf` → default pg_hba allows only localhost (127.0.0.1, ::1) → Docker-network IPs get "no pg_hba.conf entry"
- Both failures are invisible to `pg_isready` without `-h` flag — healthcheck passes via Unix socket while TCP is broken
- Fix: custom `postgresql.conf` must explicitly include `listen_addresses = '*'` and `hba_file = '/etc/postgresql/pg_hba.conf'`; mount both files via Docker volumes

## Details

The `postgres:16-alpine` Docker image ships with a default configuration that includes `listen_addresses = '*'` and a permissive `pg_hba.conf` allowing connections from any Docker-network IP. When a custom `postgresql.conf` is mounted via `command: -c config_file=/path`, PostgreSQL reads only that file and ignores the image's built-in configuration entirely. Any setting not present in the custom file falls back to PostgreSQL's compile-time default, not the image's runtime default.

This creates a two-layer failure for Docker Compose deployments:

**Layer 1 — listen_addresses:** PostgreSQL's compile-time default for `listen_addresses` is `localhost`, which means only connections via Unix socket or loopback (127.0.0.1) are accepted. In a Docker Compose environment, other containers (api, notifier, cron) connect via the Docker bridge network (typically 172.20.0.x). These TCP connections are refused because postgres is not listening on the container's network interface.

**Layer 2 — pg_hba.conf:** Even if `listen_addresses = '*'` is added, the default `pg_hba.conf` (the one PostgreSQL generates at `initdb` time) permits only `127.0.0.1/32` and `::1/128`. Docker-network IPs in the 172.16.0.0/12 range are rejected with `FATAL: no pg_hba.conf entry for host "172.20.0.5"`. The fix requires creating a custom `pg_hba.conf` with entries like `host all all 172.16.0.0/12 scram-sha-256` and mounting it alongside the custom `postgresql.conf`.

In the Poputchiki deployment on 2026-05-13, `docker-compose.prod.yml` mounted `./postgres/postgresql.conf` as a custom config. The custom config lacked both `listen_addresses` and `hba_file`, causing all API containers to fail with ECONNREFUSED when attempting to connect to the postgres container.

The compound effect: `pg_isready` (the healthcheck command) succeeded via Unix socket, marking the postgres container as "healthy". Docker Compose then started dependent containers. Those containers attempted TCP connections to `postgres:5432` — which were refused because TCP wasn't listening. The failure appeared as "postgres is healthy but can't connect" — a deeply confusing symptom without understanding the Unix socket vs TCP distinction.

An additional path-resolution gotcha: if the compose file is in `/opt/poputchiki/infra/`, a volume like `./infra/postgres/postgresql.conf` resolves to `infra/infra/postgres/...` (double infra). The correct relative path from the compose file's location is `./postgres/postgresql.conf`.

## Related Concepts

- [[concepts/pg-isready-tcp-vs-unix-socket]] - pg_isready passes on Unix socket while TCP is broken — the symptom that masks this config issue
- [[concepts/self-hosted-postgres]] - Self-hosted PostgreSQL 16 in Docker context where custom config is used
- [[concepts/docker-healthcheck-curl]] - Healthcheck commands must match the actual connection method used by dependent services

## Sources

- [[daily/2026-05-13.md]] - Session 15:15 and 15:30: `listen_addresses = '*'` missing from custom postgresql.conf → Docker-network TCP refused; `pg_hba.conf` not mounted → 172.x IPs rejected; both fixed by adding explicit settings and volume mounts; compose path double-infra resolution gotcha
