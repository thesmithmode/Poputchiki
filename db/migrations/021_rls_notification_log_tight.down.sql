-- Rollback 021: восстановить RLS notification_log как в состоянии после migration 020.
-- 020 включила RLS с одной политикой FOR ALL USING (true) WITH CHECK (true).

DROP POLICY IF EXISTS notification_log_insert ON notification_log;
DROP POLICY IF EXISTS notification_log_update ON notification_log;
DROP POLICY IF EXISTS notification_log_select ON notification_log;
DROP POLICY IF EXISTS notification_log_delete ON notification_log;

-- Восстановить политику из 020
DROP POLICY IF EXISTS notification_log_app ON notification_log;
CREATE POLICY notification_log_app ON notification_log
  FOR ALL USING (true) WITH CHECK (true);
