---
name: FORCE ROW LEVEL SECURITY
description: Security-critical tables without FORCE ROW LEVEL SECURITY allow superuser/table-owner to bypass all RLS policies
type: concept
tags: [postgres, rls, security, auth, access-control]
created: 2026-05-20
updated: 2026-05-20
compiled_from: daily/2026-05-20.md (sector-shared-db review, shared-db-C2)
---

# FORCE ROW LEVEL SECURITY

## Problem

`CREATE TABLE` enables RLS by default only after `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`. But the table owner and superuser bypass RLS even when it is enabled — unless `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is also set. Security-critical tables (`revoked_tokens`, `users`, `rides`) without `FORCE ROW LEVEL SECURITY` are fully accessible to the DB role that owns them, regardless of any policy.

## Why It Matters

The API connects to Postgres as the application role (e.g., `api_user`). If that role owns the tables, it bypasses RLS. Any SQL injection that escalates to the owner role, any misconfigured connection string, or any future migration that runs as owner will silently bypass all security policies.

The project uses RLS as a primary authorization layer (SPEC §3.4). If the foundation has a bypass hole, the entire authorization model has a silent superuser escape hatch.

## Affected Tables (minimum)

- `revoked_tokens` — must be unreadable to non-auth paths
- `users` — PII encryption is pointless if owner can SELECT plaintext keys
- `rides`, `trip_requests` — core business data with per-user visibility rules

## Fix

```sql
-- Enable RLS (already required)
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;

-- ALSO force it — closes the owner/superuser bypass
ALTER TABLE revoked_tokens FORCE ROW LEVEL SECURITY;
```

Apply to every security-critical table. The application role should NOT be the table owner — use a dedicated migration role for DDL and a separate application role for DML.

## Correct Pattern

```sql
-- Migration role owns the table
-- Application role gets only DML grants
GRANT SELECT, INSERT, UPDATE, DELETE ON revoked_tokens TO api_user;

-- RLS applies to api_user regardless of FORCE, but FORCE protects against
-- accidental connection as the owner role
ALTER TABLE revoked_tokens FORCE ROW LEVEL SECURITY;
```

## Verification

```sql
SELECT tablename, rowsecurity, forceroulsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('revoked_tokens', 'users', 'rides', 'trip_requests');
-- forceroulsecurity should be true for all
```

## Affected Files

- DB migrations — table creation / security configuration
- `packages/shared/src/db/migrations/` or equivalent

## Related

- [[concepts/rls-guc-identity]] — GUC-based identity that feeds into RLS policies
- [[concepts/notifier-service-role-rls]] — notifier service role needing read-only bypass pattern
