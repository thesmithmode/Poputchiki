DROP POLICY IF EXISTS dlq_service_all ON notification_dlq;
CREATE POLICY dlq_service_all ON notification_dlq
  FOR ALL
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

DROP POLICY IF EXISTS notif_service_delete ON user_notifications;
CREATE POLICY notif_service_delete ON user_notifications
  FOR DELETE
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));
