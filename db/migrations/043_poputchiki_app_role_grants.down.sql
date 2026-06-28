-- Rollback 043: remove only grants delivered by this forward migration.
-- Do not drop the cluster-wide role: it may be used by other databases.

REVOKE SELECT ON user_stats_view FROM poputchiki_app;
GRANT SELECT ON user_stats TO poputchiki_app;

REVOKE INSERT ON nonces FROM poputchiki_app;
GRANT SELECT, UPDATE, DELETE ON nonces TO poputchiki_app;

REVOKE INSERT ON error_log FROM poputchiki_app;
GRANT SELECT, UPDATE, DELETE ON error_log TO poputchiki_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM poputchiki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM poputchiki_app;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM poputchiki_app;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM poputchiki_app;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM poputchiki_app;
REVOKE USAGE ON SCHEMA app FROM poputchiki_app;
REVOKE USAGE ON SCHEMA public FROM poputchiki_app;
REVOKE poputchiki_service FROM poputchiki_app;
