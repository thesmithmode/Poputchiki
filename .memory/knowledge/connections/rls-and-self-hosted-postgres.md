---
title: "Connection: RLS Identity and Self-Hosted PostgreSQL"
connects:
  - "concepts/rls-guc-identity"
  - "concepts/self-hosted-postgres"
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# Connection: RLS Identity and Self-Hosted PostgreSQL

## The Connection

The decision to use self-hosted PostgreSQL (instead of Supabase) directly caused the invention of the GUC-based RLS identity pattern. These two concepts are causally linked: one forced the other.

## Key Insight

Supabase provides `auth.uid()` and `auth.jwt()` as PostgreSQL functions that RLS policies can call directly. These functions are injected by Supabase's own extensions and are not available in a vanilla PostgreSQL instance. When the project migrated to self-hosted PostgreSQL 16, every RLS policy that referenced `auth.uid()` broke. The solution — setting GUC parameters (`app.current_user_id`, `app.current_user_tg_id`, `app.current_user_role`) at the API layer before each transaction — is both the replacement for Supabase auth functions AND a more explicit, auditable identity mechanism.

The GUC approach is arguably more transparent than Supabase's magic functions: the identity is set in application code (`withIdentity()` helper), is visible in query logs, and is transaction-scoped so it cannot leak across pooled connections.

## Evidence

From the 2026-05-01 session: all documentation was updated to replace `auth.uid()`/`auth.jwt()` references with the GUC pattern. The SPEC, CLAUDE.md, and OPEN-QUESTIONS docs now explicitly state "НЕ использовать `auth.uid()`" — the only remaining occurrences are warning labels, intentionally preserved.

## Related Concepts

- [[concepts/rls-guc-identity]] - The GUC-based identity mechanism
- [[concepts/self-hosted-postgres]] - Why Supabase functions are unavailable
- [[concepts/poputchiki-stack]] - Overall architecture context
