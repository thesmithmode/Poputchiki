-- Migration 034: RLS-политики для poputchiki_service на таблице rides
--
-- Проблема: cron (expand_templates, finalize_rides) работает без GUC app.current_user_id,
-- поэтому существующие RLS policies (rides_insert, rides_update) блокируют все операции.
-- expand_templates: INSERT всегда 0 строк → поездки из шаблонов не создаются.
-- finalize_rides: UPDATE всегда 0 строк → поездки не переходят в completed/archived.
-- Решение: отдельные политики для роли poputchiki_service (аналог 027_notifier_service_rls).

CREATE POLICY rides_service_insert ON rides
  FOR INSERT
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

CREATE POLICY rides_service_update ON rides
  FOR UPDATE
  USING  (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));
