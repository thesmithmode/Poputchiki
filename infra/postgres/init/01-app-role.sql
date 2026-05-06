-- Create non-superuser app role for Poputchiki services
-- Runs once on first DB init via /docker-entrypoint-initdb.d/

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Set password from env (injected by entrypoint if APP_PASSWORD is set; skip if absent)
-- ALTER ROLE app WITH PASSWORD :'APP_PASSWORD';

GRANT CONNECT ON DATABASE poputchiki TO app;
GRANT USAGE ON SCHEMA public TO app;

-- Existing tables and sequences
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app;

-- Future tables and sequences created by superuser
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app;
