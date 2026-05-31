-- Rollback 042: local Telegram avatar cache metadata

DROP INDEX IF EXISTS idx_users_avatar_checked_at;

CREATE OR REPLACE FUNCTION app.anonymize_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE users SET
    display_name      = 'Удалённый',
    avatar_url        = NULL,
    phone_enc         = NULL,
    apt_number_enc    = NULL,
    tg_username       = NULL,
    is_banned         = true,
    deleted_at        = now()
  WHERE id = p_user_id AND deleted_at IS NULL;
END;
$$;

ALTER TABLE users
  DROP COLUMN IF EXISTS avatar_checked_at,
  DROP COLUMN IF EXISTS avatar_mime,
  DROP COLUMN IF EXISTS avatar_file_unique_id;
