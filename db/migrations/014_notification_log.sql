-- Notifier idempotency: persistent dedup log with 5-minute window
CREATE TABLE notification_log (
  notification_id text        PRIMARY KEY,
  user_id         uuid        NOT NULL,
  category        text        NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL
                              CHECK (status IN ('sent','failed','skipped_dup','skipped_disabled'))
);

CREATE INDEX idx_notification_log_user ON notification_log (user_id, sent_at DESC);
CREATE INDEX idx_notification_log_sent ON notification_log (sent_at DESC);
