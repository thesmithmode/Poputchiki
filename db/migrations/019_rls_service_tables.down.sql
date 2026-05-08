-- Rollback migration 019: отмена RLS на служебных таблицах

-- error_log
DROP POLICY IF EXISTS error_log_insert ON error_log;
DROP POLICY IF EXISTS error_log_select ON error_log;
ALTER TABLE error_log DISABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE, DELETE ON error_log TO poputchiki_app;

-- nonces
DROP POLICY IF EXISTS nonces_insert ON nonces;
DROP POLICY IF EXISTS nonces_service_select ON nonces;
DROP POLICY IF EXISTS nonces_service_delete ON nonces;
ALTER TABLE nonces DISABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE, DELETE ON nonces TO poputchiki_app;

-- rate_limit_buckets
DROP POLICY IF EXISTS rate_limit_app ON rate_limit_buckets;
ALTER TABLE rate_limit_buckets DISABLE ROW LEVEL SECURITY;

-- idempotency_keys (восстановление не нужно, гранты уже есть из 003)
