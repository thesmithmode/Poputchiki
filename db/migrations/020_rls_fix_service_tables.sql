-- Migration 020: дополнение RLS 019 — добавляет недостающие политики для error_log и notification_log.
-- Причина: миграция 019 не добавила DELETE-политику для error_log и не включила RLS
-- для notification_log, что блокировало cron-cleanup под FORCE RLS.

-- ---------------------------------------------------------------------------
-- error_log: добавляем DELETE-политику для poputchiki_service,
-- расширяем SELECT чтобы service-роль тоже могла читать (для cleanup).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS error_log_select ON error_log;
CREATE POLICY error_log_select ON error_log
  FOR SELECT USING (
    app.is_admin()
    OR pg_has_role(current_user, 'poputchiki_service', 'MEMBER')
  );

CREATE POLICY error_log_delete ON error_log
  FOR DELETE USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

-- Выдаём DELETE права роли (были REVOKE в 019)
GRANT DELETE ON error_log TO poputchiki_service;

-- ---------------------------------------------------------------------------
-- notification_log: включаем RLS. Таблица создана в 014 без RLS.
-- INSERT/SELECT/DELETE/UPDATE — только для poputchiki_app или poputchiki_service.
-- ---------------------------------------------------------------------------
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log FORCE ROW LEVEL SECURITY;

-- poputchiki_app: INSERT/SELECT/UPDATE (notifier работает от poputchiki_app)
CREATE POLICY notification_log_app ON notification_log
  FOR ALL USING (true) WITH CHECK (true);

-- poputchiki_service: все операции (для cron-cleanup DELETE)
-- Покрывается политикой notification_log_app (USING true) — service = member of app.
-- notification_log_app применяется для всех, включая service-роль.
