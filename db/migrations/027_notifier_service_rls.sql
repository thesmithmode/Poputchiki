-- Migration 027: разрешить poputchiki_service читать/обновлять users для нотификатора
--
-- Проблема: notifier не устанавливает GUC app.current_user_id, поэтому
-- существующие RLS policies (users_read_public, notification_preferences_own)
-- блокируют его запросы → getRecipient возвращает null → TG уведомления не доходят.
-- Notifier эскалирует до poputchiki_service через SET LOCAL ROLE в транзакции.

-- users: чтение TG-данных при отправке уведомления
CREATE POLICY users_service_select ON users
  FOR SELECT
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

-- users: отметка bot-blocked (notify_disabled = true)
CREATE POLICY users_service_update ON users
  FOR UPDATE
  USING  (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

-- notification_preferences: проверка opt-out при отправке
CREATE POLICY notification_prefs_service_select ON notification_preferences
  FOR SELECT
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));
