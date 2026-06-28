-- Migration 038: require active poputchiki_service role for service-only RLS.
--
-- pg_has_role(..., 'MEMBER') is true for poputchiki_app because the app role is
-- allowed to SET LOCAL ROLE poputchiki_service. Service-only policies must check
-- the active transaction role instead, so ordinary app-role SQL cannot satisfy
-- them before explicit role escalation.

DROP POLICY IF EXISTS notif_service_delete ON user_notifications;
CREATE POLICY notif_service_delete ON user_notifications
  FOR DELETE
  USING (current_role = 'poputchiki_service');

DROP POLICY IF EXISTS dlq_service_all ON notification_dlq;
CREATE POLICY dlq_service_all ON notification_dlq
  FOR ALL
  USING (current_role = 'poputchiki_service')
  WITH CHECK (current_role = 'poputchiki_service');
