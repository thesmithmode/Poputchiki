-- Migration 043: deliver poputchiki_app role/grants to upgraded databases.
-- The original role hardening was added to 000_app_identity.sql, but existing
-- databases that already recorded migration 000 will not rerun it.

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'poputchiki_app') THEN
    CREATE ROLE poputchiki_app WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END $$;

ALTER ROLE poputchiki_app WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
GRANT poputchiki_service TO poputchiki_app;

GRANT USAGE ON SCHEMA public TO poputchiki_app;
GRANT USAGE ON SCHEMA app TO poputchiki_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO poputchiki_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO poputchiki_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO poputchiki_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poputchiki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO poputchiki_app;

-- Preserve narrower grants from later hardening migrations when this migration
-- runs on an already-upgraded database.
REVOKE SELECT, UPDATE, DELETE ON error_log FROM poputchiki_app;
GRANT INSERT ON error_log TO poputchiki_app;

REVOKE SELECT, UPDATE, DELETE ON nonces FROM poputchiki_app;
GRANT INSERT ON nonces TO poputchiki_app;

REVOKE SELECT ON user_stats FROM poputchiki_app;
GRANT SELECT ON user_stats_view TO poputchiki_app;
