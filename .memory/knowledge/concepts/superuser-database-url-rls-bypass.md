---
title: "Superuser DATABASE_URL Bypasses RLS Entirely"
aliases: [superuser-rls-bypass, database-url-superuser, postgres-superuser-rls, app-role-bypass]
tags: [security, database, postgresql, rls, gotcha, critical]
sources:
  - "daily/2026-05-08.md"
created: 2026-05-08
updated: 2026-05-08
---

# Superuser DATABASE_URL Bypasses RLS Entirely

PostgreSQL superusers bypass Row-Level Security unconditionally. If `docker-compose.prod.yml` passes `POSTGRES_USER` (the superuser) as the connection user in `DATABASE_URL`, the API runs as a superuser and all RLS policies are silently ignored — even correctly written ones with valid GUC variables.

## Key Points

- PostgreSQL superuser role is exempt from RLS by design — `BYPASSRLS` is a superuser attribute
- Using `POSTGRES_USER` in `DATABASE_URL` means the API connects as the superuser → all `USING (...)` clauses in RLS policies are never evaluated
- The `app` role created in `01-app-role.sql` (with `SET ROLE` / `BYPASSRLS` denied, restricted permissions) is never used if `DATABASE_URL` points to the superuser
- Symptom is invisible in tests because test infrastructure often runs with a test superuser, masking the gap
- Fix: `DATABASE_URL` must reference the application role (`poputchiki_app` or equivalent), not `POSTGRES_USER`

## Details

The Poputchiki database schema creates a dedicated application role via `infra/postgres/init/01-app-role.sql`. This role has:
- `CONNECT` and `USAGE` on the `app` schema
- `SELECT`, `INSERT`, `UPDATE`, `DELETE` on specific tables only
- No `BYPASSRLS` attribute — all RLS policies apply

If `docker-compose.prod.yml` sets `DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/poputchiki` (using the superuser `postgres`), the API never goes through RLS. Every query sees every row regardless of `app.current_user_id`. The `withIdentity()` GUC setup still runs, but it has no effect because the evaluating user is a superuser.

The correct production configuration:
```
DATABASE_URL=postgres://poputchiki_app:${APP_DB_PASSWORD}@postgres:5432/poputchiki
```

And `POSTGRES_USER`/`POSTGRES_PASSWORD` should only be used for:
- `DATABASE_MIGRATOR_URL` — migrations need DDL permissions (superuser or `OWNER`)
- The initial database creation (handled by Docker init scripts)
- Admin tooling (psql access for debugging)

This was found during a production release code review and classified as a critical security blocker. All tenant isolation, ride privacy, and user data protection depends on RLS being enforced — superuser bypass nullifies the entire security model.

## Related Concepts

- [[concepts/rls-guc-identity]] - The GUC-based RLS identity mechanism that superuser bypass defeats entirely
- [[concepts/self-hosted-postgres]] - Self-hosted setup context; managed services like Supabase enforce role separation automatically
- [[connections/rls-and-self-hosted-postgres]] - The self-hosted migration made correct role setup the developer's responsibility

## Sources

- [[daily/2026-05-08.md]] - Session 09:28: code review found `docker-compose.prod.yml` uses POSTGRES_USER in DATABASE_URL → RLS bypassed entirely; `app` role from `01-app-role.sql` never used; classified as critical release blocker; fix: use application role in DATABASE_URL, superuser only for migrations
