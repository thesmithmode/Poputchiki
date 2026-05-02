-- Rollback 000: drop app schema, identity functions, and app role
DROP ROLE IF EXISTS poputchiki_app;
DROP SCHEMA IF EXISTS app CASCADE;
