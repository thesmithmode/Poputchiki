CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        text PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE CASCADE,
  revoked_at timestamptz NOT NULL DEFAULT NOW()
);

-- RLS: deny all access to app role — revocation checks and inserts use the superuser pool
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY revoked_tokens_deny_all ON revoked_tokens
  AS RESTRICTIVE
  FOR ALL
  TO poputchiki_app
  USING (false)
  WITH CHECK (false);

-- Index for TTL cleanup job (cron can DELETE WHERE revoked_at < NOW() - INTERVAL '60 days')
CREATE INDEX IF NOT EXISTS revoked_tokens_revoked_at_idx ON revoked_tokens (revoked_at);
