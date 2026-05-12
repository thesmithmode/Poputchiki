---
title: "CI PostgreSQL Environment vs Docker Init Scripts"
aliases: [ci-env-postgres, docker-init-ci-gap, ci-role-missing, postgres-ci-setup]
tags: [ci-cd, testing, postgresql, gotcha, infra]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-08
---

# CI PostgreSQL Environment vs Docker Init Scripts

Database roles, extensions, and schemas created by `infra/postgres/init/` scripts are not automatically available in GitHub Actions CI PostgreSQL service containers. CI spins up a fresh PostgreSQL instance without running any Docker init scripts, so migrations that depend on pre-existing roles fail at runtime.

## Key Points

- `infra/postgres/init/01-app-role.sql` creates `poputchiki_app` and `poputchiki_service` roles — these only exist in Docker Compose environments
- CI migration step (`migration 020`) referenced role `poputchiki_service` → `ERROR: role "poputchiki_service" does not exist` in CI
- Fix: add an explicit role-creation step to the CI workflow before running migrations (idempotent `CREATE ROLE IF NOT EXISTS`)
- The pattern applies to any custom role, extension, or schema that Docker init creates: `pgcrypto`, custom functions, `app` schema
- Secondary finding: `REVOKE SELECT ON error_log FROM poputchiki_app` in migration 019 — role must exist before REVOKE can reference it

## Details

The GitHub Actions CI workflow uses a `postgres` service container with `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` environment variables. This creates a bare PostgreSQL instance. The `infra/postgres/init/` directory contains initialization scripts that Docker Compose runs via the `initdb.d` mechanism — but CI's service container ignores these scripts entirely.

This creates a class of "works locally, fails in CI" bugs where:
- Migrations reference roles created by init scripts → `ERROR: role "X" does not exist`
- Migrations use extensions installed by init scripts → `ERROR: function pgp_sym_encrypt(...) does not exist`
- RLS policies reference custom functions → `ERROR: function X() does not exist`

The correct fix is to add a setup step to the CI workflow that runs before migrations:

```yaml
- name: Setup PostgreSQL roles
  run: |
    PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U $POSTGRES_USER -d $POSTGRES_DB -c "
      CREATE ROLE IF NOT EXISTS poputchiki_app WITH LOGIN PASSWORD 'test';
      CREATE ROLE IF NOT EXISTS poputchiki_service WITH LOGIN PASSWORD 'test';
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
      CREATE SCHEMA IF NOT EXISTS app;
    "
```

This step must be idempotent (`IF NOT EXISTS`) so it does not break if the CI environment is ever enhanced to run init scripts. The step is different from the init scripts themselves — CI uses simple `psql` commands rather than Docker's initdb mechanism.

A checklist for new migrations: before writing any `GRANT`, `REVOKE`, or `SET ROLE` that references a custom role, verify that role is created in both the Docker init scripts AND the CI setup step. These two places must be kept in sync.

## Related Concepts

- [[concepts/ci-parallel-jobs]] - CI workflow where the setup step must be added
- [[concepts/self-hosted-postgres]] - Docker init scripts that create the roles CI is missing
- [[concepts/deployment-pipeline]] - Production deployment uses Docker Compose which does run init scripts — only CI is affected

## Sources

- [[daily/2026-05-08.md]] - Session 13:02: CI `dev` failed — migration 020 referenced `poputchiki_service` which doesn't exist in CI PostgreSQL (only in Docker init); fix: add role-creation step to integration/security CI jobs before migration; same pattern applies to pgcrypto extension and app schema
