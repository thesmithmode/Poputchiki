-- Rollback 000: drop app schema and revoke role privs in CURRENT database only.
-- The role `poputchiki_app` is cluster-wide; other databases (e.g., the shared
-- integration test DB) may still grant it privileges. Dropping it cluster-wide
-- here would fail with `2BP01: role cannot be dropped because some objects
-- depend on it` and break the migrations sentinel test that runs in an ephemeral
-- DB alongside the shared one.
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'poputchiki_service') THEN
    -- BYPASSRLS — кластерный атрибут, не трогаем в per-DB rollback
    EXECUTE 'REVOKE USAGE ON SCHEMA public FROM poputchiki_service';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM poputchiki_service';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM poputchiki_service';
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'poputchiki_app') THEN
    EXECUTE 'REASSIGN OWNED BY poputchiki_app TO ' || quote_ident(current_user);
    EXECUTE 'DROP OWNED BY poputchiki_app';
  END IF;
END $$;
DROP SCHEMA IF EXISTS app CASCADE;
