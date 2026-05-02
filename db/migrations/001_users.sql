-- Migration 001: users table + pgcrypto + RLS deny-by-default

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

CREATE TABLE users (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id                 bigint      UNIQUE NOT NULL,
  tg_username           text,
  display_name          text        NOT NULL,
  avatar_url            text,
  apt_number_enc        bytea,
  phone_enc             bytea,
  is_verified           boolean     NOT NULL DEFAULT false,
  is_banned             boolean     NOT NULL DEFAULT false,
  notify_disabled       boolean     NOT NULL DEFAULT false,
  onboarded             boolean     NOT NULL DEFAULT false,
  role                  text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  likes_received_count  int         NOT NULL DEFAULT 0,
  rides_total_count     int         NOT NULL DEFAULT 0,
  rides_completed_count int         NOT NULL DEFAULT 0,
  avg_stars             numeric(3,2),
  reviews_count         int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);

CREATE INDEX idx_users_trust ON users (created_at, likes_received_count) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_tg_id ON users (tg_id) WHERE deleted_at IS NULL;

-- RLS: deny-by-default
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

-- Any authenticated user can see non-deleted public profiles
CREATE POLICY users_read_public ON users
  FOR SELECT
  USING (app.current_user_id() IS NOT NULL AND deleted_at IS NULL);

-- Users can only update their own row
CREATE POLICY users_update_self ON users
  FOR UPDATE
  USING (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());

-- Insert allowed for own id OR admin (api upserts during auth)
CREATE POLICY users_insert_self ON users
  FOR INSERT
  WITH CHECK (id = app.current_user_id() OR app.is_admin());

-- Soft-delete: only own row or admin
CREATE POLICY users_delete_self ON users
  FOR DELETE
  USING (id = app.current_user_id() OR app.is_admin());
