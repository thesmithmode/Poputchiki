CREATE TABLE IF NOT EXISTS error_log (
  id         BIGSERIAL PRIMARY KEY,
  message    TEXT        NOT NULL,
  stack      TEXT        NOT NULL DEFAULT '',
  path       TEXT        NOT NULL DEFAULT '',
  method     TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_log_created_at ON error_log (created_at DESC);
