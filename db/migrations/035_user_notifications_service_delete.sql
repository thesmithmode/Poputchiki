-- Migration 035: poputchiki_service может DELETE user_notifications
--
-- Назначение: retention cron (cleanupUserNotifications) использует
-- SET LOCAL ROLE poputchiki_service (BYPASSRLS), но даже с BYPASSRLS требуется
-- table-level GRANT DELETE. ALTER DEFAULT PRIVILEGES (миграция 000) даёт DELETE
-- автоматически только если default privileges применились к owner-у миграций.
-- Чтобы не зависеть от того, кто создал таблицу, явно гарантируем грант.

GRANT DELETE ON user_notifications TO poputchiki_service;

-- Для прозрачности: добавляем DELETE-политику для poputchiki_service.
-- Это избыточно (BYPASSRLS на роли), но защита от регрессии "снимем BYPASSRLS".
CREATE POLICY notif_service_delete ON user_notifications
  FOR DELETE
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));
