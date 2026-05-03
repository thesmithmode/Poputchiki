-- Migration 006: PGP symmetric encryption helpers for PII fields (phone, apt_number).
-- pgcrypto extension was enabled in migration 001.
-- Key is passed per-transaction via set_config('pgcrypto.key', key, true).

-- Encrypt PII plaintext using the session-local key.
-- Call site must SET LOCAL pgcrypto.key before invoking.
CREATE OR REPLACE FUNCTION app.encrypt_pii(plaintext text)
  RETURNS bytea
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, app AS $$
    SELECT pgp_sym_encrypt(
      plaintext,
      current_setting('pgcrypto.key')
    )::bytea
  $$;

-- Decrypt phone/apt_number for the requesting user only.
-- Returns 0 rows if app.current_user_id() != target_user_id (ownership guard).
CREATE OR REPLACE FUNCTION app.decrypt_user_pii(target_user_id uuid)
  RETURNS TABLE (phone text, apt_number text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = pg_catalog, public, app AS $$
    SELECT
      CASE WHEN u.phone_enc IS NOT NULL
        THEN pgp_sym_decrypt(u.phone_enc, current_setting('pgcrypto.key'))
        ELSE NULL
      END AS phone,
      CASE WHEN u.apt_number_enc IS NOT NULL
        THEN pgp_sym_decrypt(u.apt_number_enc, current_setting('pgcrypto.key'))
        ELSE NULL
      END AS apt_number
    FROM users u
    WHERE u.id = target_user_id
      AND app.current_user_id() = target_user_id
      AND u.deleted_at IS NULL
  $$;

GRANT EXECUTE ON FUNCTION app.encrypt_pii(text) TO poputchiki_app;
GRANT EXECUTE ON FUNCTION app.decrypt_user_pii(uuid) TO poputchiki_app;
