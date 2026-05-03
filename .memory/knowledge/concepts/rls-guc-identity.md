---
title: "RLS Identity via PostgreSQL GUC Variables"
aliases: [rls-identity, guc-identity, app-current-user]
tags: [security, database, rls, authentication]
sources:
  - "daily/2026-05-01.md"
created: 2026-05-01
updated: 2026-05-01
---

# RLS Identity via PostgreSQL GUC Variables

Without Supabase's `auth.uid()` / `auth.jwt()` functions, Poputchiki enforces Row-Level Security (RLS) by setting PostgreSQL GUC (Grand Unified Configuration) parameters at the start of each transaction from the API layer.

## Key Points

- Three GUC variables: `app.current_user_id`, `app.current_user_tg_id`, `app.current_user_role`
- Set via `set_config('app.current_user_id', ..., true)` in `apps/api` at the start of each transaction
- The `true` flag makes the setting transaction-local (reset after transaction ends)
- A `withIdentity()` helper function in the API layer sets all three variables consistently
- RLS policies reference `current_setting('app.current_user_id')` instead of `auth.uid()`

## Details

The standard Supabase pattern calls `auth.uid()` directly in RLS policies, which relies on Supabase's own PostgreSQL extensions. When switching to self-hosted PostgreSQL, these functions are unavailable. The solution is to push identity information into the database session at the application layer before executing any business query.

The API layer calls `set_config('app.current_user_id', userId, true)` (and similarly for `tg_id` and `role`) in a wrapper around every authenticated request handler. The `true` parameter scopes the GUC to the current transaction, preventing identity leakage between requests that share a connection pool entry.

RLS policies are then written as `USING (user_id = current_setting('app.current_user_id')::bigint)` or similar casts. The threat model treats every user as a potential attacker, so deny-by-default RLS is applied to all tables, with explicit GRANT rules per role.

## Related Concepts

- [[concepts/self-hosted-postgres]] - Why Supabase auth functions are unavailable
- [[concepts/poputchiki-stack]] - Overall architecture context
- [[connections/rls-and-self-hosted-postgres]] - How the migration forced this pattern

## Sources

- [[daily/2026-05-01.md]] - RLS pattern migrated from `auth.uid()`/`auth.jwt()` to `app.current_user_id` GUC; `withIdentity()` helper introduced; all docs updated
