-- Helper: anonymize user data per 152-FZ right to erasure.
-- Scope: nullifies PII fields and bans the account. Related rows (reviews, likes,
-- ride_participation, complaints, support_messages) are kept for integrity but the
-- user is no longer identifiable by name/avatar/phone/username. tg_id is retained
-- to prevent re-registration on the same account.
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
