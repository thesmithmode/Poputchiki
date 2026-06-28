-- Migration 043: harden notification_dlq RLS against app-role membership bypass.
--
-- poputchiki_app is a MEMBER of poputchiki_service only to allow explicit
-- SET LOCAL ROLE poputchiki_service in privileged jobs. A policy based on
-- pg_has_role(current_user, 'poputchiki_service', 'MEMBER') also matches normal
-- app-role sessions, so the DLQ policy must require the active role instead.

ALTER TABLE notification_dlq FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dlq_service_all ON notification_dlq;
CREATE POLICY dlq_service_all ON notification_dlq
  FOR ALL
  USING (current_role = 'poputchiki_service')
  WITH CHECK (current_role = 'poputchiki_service');

REVOKE ALL ON notification_dlq FROM poputchiki_app;
REVOKE ALL ON SEQUENCE notification_dlq_id_seq FROM poputchiki_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_dlq TO poputchiki_service;
GRANT USAGE, SELECT ON SEQUENCE notification_dlq_id_seq TO poputchiki_service;
