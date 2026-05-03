-- Migration 003: social tables — likes, reviews, favorites, private_notes,
--                complaints, audit_log, idempotency_keys

-- ---------------------------------------------------------------------------
-- likes: symmetric per-ride likes (subject → target)
-- ---------------------------------------------------------------------------
CREATE TABLE likes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id    uuid        NOT NULL REFERENCES rides(id)  ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, target_id, ride_id),
  CHECK (subject_id <> target_id)
);

CREATE INDEX idx_likes_subject ON likes (subject_id);
CREATE INDEX idx_likes_target  ON likes (target_id);
CREATE INDEX idx_likes_ride    ON likes (ride_id);

ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes FORCE ROW LEVEL SECURITY;

CREATE POLICY likes_read ON likes
  FOR SELECT USING (app.current_user_id() IS NOT NULL);

CREATE POLICY likes_insert ON likes
  FOR INSERT WITH CHECK (subject_id = app.current_user_id());

CREATE POLICY likes_delete ON likes
  FOR DELETE USING (subject_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- reviews: per-ride reviews with stars 1-5 (immutable after insert)
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id         uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id    uuid     NOT NULL REFERENCES rides(id)  ON DELETE RESTRICT,
  subject_id uuid     NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  target_id  uuid     NOT NULL REFERENCES users(id)  ON DELETE RESTRICT,
  stars      smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text       text     CHECK (length(text) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, subject_id, target_id),
  CHECK (subject_id <> target_id)
);

CREATE INDEX idx_reviews_target  ON reviews (target_id);
CREATE INDEX idx_reviews_subject ON reviews (subject_id);
CREATE INDEX idx_reviews_ride    ON reviews (ride_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;

CREATE POLICY reviews_read ON reviews
  FOR SELECT USING (app.current_user_id() IS NOT NULL);

CREATE POLICY reviews_insert ON reviews
  FOR INSERT WITH CHECK (subject_id = app.current_user_id());

-- No UPDATE policy: reviews are immutable (FORCE RLS denies by default)

-- ---------------------------------------------------------------------------
-- favorites: user bookmarks another user
-- ---------------------------------------------------------------------------
CREATE TABLE favorites (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id),
  CHECK (user_id <> target_id)
);

CREATE INDEX idx_favorites_user   ON favorites (user_id);
CREATE INDEX idx_favorites_target ON favorites (target_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites FORCE ROW LEVEL SECURITY;

CREATE POLICY favorites_all ON favorites
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- private_notes: user's private note about another user
-- ---------------------------------------------------------------------------
CREATE TABLE private_notes (
  user_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       text        NOT NULL CHECK (length(text) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);

CREATE INDEX idx_private_notes_user ON private_notes (user_id);

ALTER TABLE private_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_notes FORCE ROW LEVEL SECURITY;

CREATE POLICY private_notes_all ON private_notes
  USING (user_id = app.current_user_id())
  WITH CHECK (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- complaints: abuse reports
-- ---------------------------------------------------------------------------
CREATE TABLE complaints (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id     uuid        REFERENCES rides(id) ON DELETE SET NULL,
  reason      text        NOT NULL CHECK (length(reason) <= 1000),
  status      text        NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'reviewed', 'resolved')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (reporter_id <> target_id)
);

CREATE INDEX idx_complaints_reporter ON complaints (reporter_id);
CREATE INDEX idx_complaints_target   ON complaints (target_id);
CREATE INDEX idx_complaints_status   ON complaints (status);

ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints FORCE ROW LEVEL SECURITY;

CREATE POLICY complaints_insert ON complaints
  FOR INSERT WITH CHECK (reporter_id = app.current_user_id());

CREATE POLICY complaints_read ON complaints
  FOR SELECT USING (reporter_id = app.current_user_id() OR app.is_admin());

-- ---------------------------------------------------------------------------
-- audit_log: immutable action log
-- No INSERT policy — api uses privileged connection (bypass RLS) or SET ROLE
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        REFERENCES users(id) ON DELETE SET NULL,
  action     text        NOT NULL,
  entity     text        NOT NULL,
  entity_id  uuid,
  meta       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user      ON audit_log (user_id);
CREATE INDEX idx_audit_log_entity    ON audit_log (entity, entity_id);
CREATE INDEX idx_audit_log_created   ON audit_log (created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Only admins may read; no INSERT via policy (api bypasses RLS for writes)
CREATE POLICY audit_log_read ON audit_log
  FOR SELECT USING (app.is_admin());

-- nonces lives in 004_nonces.sql; rate_limit_buckets lives in 005_rate_limit_buckets.sql

-- ---------------------------------------------------------------------------
-- idempotency_keys: dedup for POST requests
-- No RLS — api only
-- ---------------------------------------------------------------------------
CREATE TABLE idempotency_keys (
  key        text        PRIMARY KEY,
  response   jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
