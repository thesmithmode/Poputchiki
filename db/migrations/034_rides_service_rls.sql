-- Migration 034: RLS-политики для poputchiki_service на таблице rides
--
-- Проблема: cron (expand_templates, finalize_rides) работает без GUC app.current_user_id,
-- поэтому существующие RLS policies (rides_insert, rides_update) блокируют все операции.
-- expand_templates: INSERT всегда 0 строк → поездки из шаблонов не создаются.
-- finalize_rides: UPDATE всегда 0 строк → поездки не переходят в completed/archived.
-- Решение: отдельные политики только для активной роли poputchiki_service.
-- Важно: проверяем current_user, а не membership, чтобы poputchiki_app
-- (member of poputchiki_service для SET ROLE) не обходил ownership RLS.

CREATE POLICY rides_service_insert ON rides
  FOR INSERT
  WITH CHECK (current_user = 'poputchiki_service');

CREATE POLICY rides_service_update ON rides
  FOR UPDATE
  USING  (current_user = 'poputchiki_service')
  WITH CHECK (current_user = 'poputchiki_service');
