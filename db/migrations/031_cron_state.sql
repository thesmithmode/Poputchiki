-- REL-04: персистентный dedup для cron-задач между рестартами контейнера.
-- Без этой таблицы rolling deploy / crash-loop в backup-окно дублирует:
-- daily backup, base-backup, restore-test, expand_templates.

CREATE TABLE IF NOT EXISTS cron_state (
  job_name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL
);

ALTER TABLE cron_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_state FORCE ROW LEVEL SECURITY;

-- poputchiki_service полный доступ (используется cron-задачами через SET LOCAL ROLE)
DROP POLICY IF EXISTS cron_state_service_all ON cron_state;
CREATE POLICY cron_state_service_all ON cron_state
  FOR ALL TO poputchiki_service
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON cron_state TO poputchiki_service;
