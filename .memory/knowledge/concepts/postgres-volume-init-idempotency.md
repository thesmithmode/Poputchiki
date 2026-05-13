---
title: "PostgreSQL Docker Volume Init — One-Time Only"
aliases: [postgres-init-once, postgres-db-env, initdb-scripts-once, docker-entrypoint-initdb, hardcoded-db-name]
tags: [postgresql, docker, gotcha, infra, deployment]
sources:
  - "daily/2026-05-13.md"
created: 2026-05-13
updated: 2026-05-13
---

# PostgreSQL Docker Volume Init — One-Time Only

`POSTGRES_DB` environment variable and `/docker-entrypoint-initdb.d/` scripts execute only when the PostgreSQL data volume is empty (first initialization). On subsequent container starts with an existing volume, neither the database creation nor the init scripts run. Changes to init scripts require manual application via `psql`.

## Key Points

- `POSTGRES_DB=poputchiki` creates the database only on first `initdb` of an empty data volume
- `/docker-entrypoint-initdb.d/*.sql` scripts run once during first init — editing them has no effect on existing volumes
- Existing volume + changed `POSTGRES_DB` env → database NOT created; must `CREATE DATABASE` manually via psql
- Hardcoding database names in init SQL (e.g., `GRANT CONNECT ON DATABASE poputchiki`) breaks when `POSTGRES_DB` differs → use `current_database()` via dynamic SQL
- Deployment with pre-existing volume: always verify DB exists and run init SQL manually if needed

## Details

The `postgres:16-alpine` Docker image has an initialization flow controlled by the `docker-entrypoint.sh` script. When the container starts, it checks whether the data directory (`/var/lib/postgresql/data`) contains an initialized PostgreSQL cluster. If empty, it runs `initdb`, creates the database specified by `POSTGRES_DB`, creates the user from `POSTGRES_USER`/`POSTGRES_PASSWORD`, and executes all scripts in `/docker-entrypoint-initdb.d/` in alphabetical order. If the data directory already contains a cluster, the entire initialization is skipped and PostgreSQL starts directly.

This one-time behavior creates three failure modes in deployment:

**Failure 1 — Missing database:** A new deployment with fresh code but an existing data volume (e.g., from a previous deployment or manual testing) will not create the `POSTGRES_DB` database. The API container starts, attempts to connect to `poputchiki`, and fails with `FATAL: database "poputchiki" does not exist`. Fix: before running migrations, check `psql -U $POSTGRES_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'"` and create if absent.

**Failure 2 — Stale init scripts:** After modifying `01-app-role.sql` to fix a bug (e.g., adding a new role or changing permissions), restarting the container does not re-run the script. The old state persists in the volume. Fix: apply changes manually via `docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -f /docker-entrypoint-initdb.d/01-app-role.sql` or write a migration that achieves the same effect.

**Failure 3 — Hardcoded database names:** Init scripts that reference a specific database name (e.g., `GRANT CONNECT ON DATABASE poputchiki TO poputchiki_app`) fail when `POSTGRES_DB` is set to a different value (e.g., `poputchiki_test` in CI). The correct pattern uses dynamic SQL with `current_database()`:

```sql
-- WRONG: hardcoded database name
GRANT CONNECT ON DATABASE poputchiki TO poputchiki_app;

-- CORRECT: dynamic, uses whatever DB is current
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO poputchiki_app', current_database());
END $$;
```

In the Poputchiki 2026-05-13 deployment, all three failures were encountered in sequence. The production server had a pre-existing postgres volume from testing. `POSTGRES_DB` was ignored (failure 1), the updated `01-app-role.sql` did not run (failure 2), and the old init SQL hardcoded `poputchiki` (failure 3). Each required manual intervention via SSH + psql.

## Related Concepts

- [[concepts/self-hosted-postgres]] - Self-hosted PostgreSQL 16 Docker context
- [[concepts/ci-env-vs-docker-init]] - CI PostgreSQL has neither Docker init scripts nor existing volumes — different init path with similar symptoms
- [[concepts/deployment-pipeline]] - Deploy pipeline must handle both fresh and existing volume scenarios

## Sources

- [[daily/2026-05-13.md]] - Session 15:30: `POSTGRES_DB` env ignored on existing volume; init scripts not re-run; hardcoded DB name `poputchiki` in `01-app-role.sql` fixed to `current_database()` via dynamic SQL; all three failure modes hit during production deployment
