REVOKE ALL ON SEQUENCE notification_dlq_id_seq FROM poputchiki_service;
REVOKE ALL ON notification_dlq FROM poputchiki_service;
DROP POLICY IF EXISTS dlq_service_all ON notification_dlq;
DROP TABLE IF EXISTS notification_dlq;
