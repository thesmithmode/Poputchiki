-- Rollback 001: drop users table (CASCADE removes policies + indexes)
DROP TABLE IF EXISTS users CASCADE;
