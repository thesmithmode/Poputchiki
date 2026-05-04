-- Migration 004: nonces for Telegram initData replay protection
-- Each initData hash is stored once; duplicate → 401 replay.

CREATE TABLE nonces (
  hash        text        PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Prune index: used by a scheduled cleanup job (TASK-cron) to delete nonces older than 10 min.
CREATE INDEX idx_nonces_created_at ON nonces (created_at);
