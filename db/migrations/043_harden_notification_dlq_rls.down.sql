DROP POLICY IF EXISTS dlq_service_all ON notification_dlq;
CREATE POLICY dlq_service_all ON notification_dlq
  FOR ALL
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

ALTER TABLE notification_dlq NO FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_dlq TO poputchiki_app;
GRANT USAGE, SELECT ON SEQUENCE notification_dlq_id_seq TO poputchiki_app;
