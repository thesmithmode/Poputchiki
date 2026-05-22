-- Migration 036: notification_dlq — dead-letter queue для TG send retries.
--
-- Назначение: 429 / 5xx / network errors из Telegram API раньше:
--   - 429: setTimeout(60s) → fire-and-forget retry в памяти процесса (теряется при restart, max 100 in-flight).
--   - 5xx/network: молча терялись, статус 'failed' без retry.
-- Решение: персистентная очередь с exponential backoff. Retry-loop pull-ит batch
-- (SKIP LOCKED для multi-replica notifier), пытается отправить, успех → DELETE,
-- fail → bump attempts + next_retry_at. После MAX_ATTEMPTS → status='dead'.
--
-- Backoff: 30s, 60s, 120s, 240s, ... cap 1h.
-- MAX_ATTEMPTS = 8 (~2h total).

CREATE TABLE notification_dlq (
  id            BIGSERIAL PRIMARY KEY,
  dedup_key     TEXT NOT NULL,           -- ключ из buildDedupKey (для идемпотентности)
  user_id       UUID NOT NULL,
  category      TEXT NOT NULL,
  payload       JSONB NOT NULL,          -- оригинальный NotifyPayload
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  last_status   INT,                     -- HTTP статус последней попытки (NULL для network err)
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status        TEXT NOT NULL DEFAULT 'pending'  -- pending | dead
    CHECK (status IN ('pending', 'dead'))
);

-- Главный индекс для retry-loop: WHERE status='pending' AND next_retry_at <= now() ORDER BY next_retry_at.
CREATE INDEX idx_notification_dlq_next_retry
  ON notification_dlq (next_retry_at)
  WHERE status = 'pending';

-- Дедуп по ключу — не создаём дубликат в DLQ при повторных failures одного события.
CREATE UNIQUE INDEX idx_notification_dlq_dedup
  ON notification_dlq (dedup_key)
  WHERE status = 'pending';

CREATE INDEX idx_notification_dlq_user ON notification_dlq (user_id, created_at DESC);

-- RLS: только service / admin читают. Обычный пользователь не видит свои dropped уведомления.
ALTER TABLE notification_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY dlq_service_all ON notification_dlq
  FOR ALL
  USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'))
  WITH CHECK (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

GRANT SELECT, INSERT, UPDATE, DELETE ON notification_dlq TO poputchiki_service;
GRANT USAGE, SELECT ON SEQUENCE notification_dlq_id_seq TO poputchiki_service;
