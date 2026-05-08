-- Rollback migration 020: отмена RLS-дополнений на error_log и notification_log

-- error_log: восстановить политику select как в 019, убрать delete
DROP POLICY IF EXISTS error_log_select ON error_log;
CREATE POLICY error_log_select ON error_log
  FOR SELECT USING (app.is_admin());

DROP POLICY IF EXISTS error_log_delete ON error_log;
REVOKE DELETE ON error_log FROM poputchiki_service;

-- notification_log: отключить RLS
DROP POLICY IF EXISTS notification_log_app ON notification_log;
ALTER TABLE notification_log DISABLE ROW LEVEL SECURITY;
