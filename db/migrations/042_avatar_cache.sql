-- Migration 042: local Telegram avatar cache metadata

ALTER TABLE users
  ADD COLUMN avatar_file_unique_id text,
  ADD COLUMN avatar_mime text,
  ADD COLUMN avatar_checked_at timestamptz;

CREATE INDEX idx_users_avatar_checked_at
  ON users (avatar_checked_at)
  WHERE deleted_at IS NULL AND avatar_url IS NOT NULL;

CREATE OR REPLACE FUNCTION app.anonymize_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE users SET
    display_name           = 'Удалённый',
    avatar_url             = NULL,
    avatar_file_unique_id  = NULL,
    avatar_mime            = NULL,
    avatar_checked_at      = NULL,
    phone_enc              = NULL,
    apt_number_enc         = NULL,
    tg_username            = NULL,
    is_banned              = true,
    deleted_at             = now()
  WHERE id = p_user_id AND deleted_at IS NULL;
END;
$$;
