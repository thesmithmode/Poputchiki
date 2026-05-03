-- Rollback migration 003: drop social tables in reverse dependency order
DROP TABLE IF EXISTS idempotency_keys   CASCADE;
DROP TABLE IF EXISTS audit_log          CASCADE;
DROP TABLE IF EXISTS complaints         CASCADE;
DROP TABLE IF EXISTS private_notes      CASCADE;
DROP TABLE IF EXISTS favorites          CASCADE;
DROP TABLE IF EXISTS reviews            CASCADE;
DROP TABLE IF EXISTS likes              CASCADE;
