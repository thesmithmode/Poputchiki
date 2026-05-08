-- Migration 021: ужесточение RLS notification_log (исправляет 020).
-- Проблема 020: FOR ALL USING (true) WITH CHECK (true) позволяла любому
-- poputchiki_app соединению читать уведомления всех пользователей.
-- notification_log — внутренняя таблица notifier-сервиса, не пользовательский API.

DROP POLICY IF EXISTS notification_log_app ON notification_log;

-- notifier INSERT'ит от poputchiki_app (без SET LOCAL ROLE)
CREATE POLICY notification_log_insert ON notification_log
  FOR INSERT WITH CHECK (true);

-- notifier UPDATE'ит статус (sent → failed) от poputchiki_app
CREATE POLICY notification_log_update ON notification_log
  FOR UPDATE USING (true) WITH CHECK (true);

-- SELECT только для admins и service-роли (диагностика, cleanup)
CREATE POLICY notification_log_select ON notification_log
  FOR SELECT USING (
    app.is_admin()
    OR pg_has_role(current_user, 'poputchiki_service', 'MEMBER')
  );

-- DELETE только для service (cron-cleanup старых записей)
CREATE POLICY notification_log_delete ON notification_log
  FOR DELETE USING (
    pg_has_role(current_user, 'poputchiki_service', 'MEMBER')
  );
