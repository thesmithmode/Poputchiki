-- Migration 003 created rate_limit_buckets with token bucket schema.
-- Replace with sliding window schema for minute-based rate limiting.
DROP TABLE IF EXISTS rate_limit_buckets;

CREATE TABLE rate_limit_buckets (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

-- For cleanup of expired windows (TASK-089)
CREATE INDEX rate_limit_buckets_window_idx
  ON rate_limit_buckets (window_start);

-- Allow app role to read/write rate_limit_buckets (no RLS on this table)
GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit_buckets TO poputchiki_app;
