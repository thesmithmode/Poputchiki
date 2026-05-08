-- Migration 000: app schema + identity helper functions
-- These replace Supabase auth.uid()/auth.jwt() — we use GUC set by apps/api withIdentity()

CREATE SCHEMA IF NOT EXISTS app;

-- Returns current user's UUID (NULL if not set → RLS denies)
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
  $$;

-- Returns current user's Telegram ID (for cookie↔jwt sentinel)
CREATE OR REPLACE FUNCTION app.current_user_tg_id() RETURNS bigint
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT NULLIF(current_setting('app.current_user_tg_id', true), '')::bigint
  $$;

-- Returns current user's role ('user' | 'admin' | 'anon' default)
CREATE OR REPLACE FUNCTION app.current_user_role() RETURNS text
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'anon')
  $$;

-- Convenience: true if current role is 'admin'
CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT app.current_user_role() = 'admin'
  $$;

-- App role: non-superuser, used by API connections and integration tests.
-- Without this role, tests connect as the DB owner (superuser) and bypass FORCE RLS.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'poputchiki_app') THEN
    CREATE ROLE poputchiki_app;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO poputchiki_app;
GRANT USAGE ON SCHEMA app TO poputchiki_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO poputchiki_app;
-- Default privileges: all future tables/sequences created by the owner in public schema
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poputchiki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO poputchiki_app;

-- Service role: privileged escalation via SET LOCAL ROLE (withSystem).
-- Created in Docker init and CI setup; ensure it exists here for migrations-sentinel test.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'poputchiki_service') THEN
    CREATE ROLE poputchiki_service NOLOGIN;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO poputchiki_service;
GRANT USAGE ON SCHEMA app TO poputchiki_service;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO poputchiki_service;
-- BYPASSRLS: withSystem bypasses RLS entirely (no app.is_admin() evaluation needed)
ALTER ROLE poputchiki_service BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poputchiki_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO poputchiki_service;
