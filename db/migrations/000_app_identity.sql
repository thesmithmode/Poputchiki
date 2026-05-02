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
