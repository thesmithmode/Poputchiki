-- Migration 043: RLS-safe notification enqueue throttle.
--
-- The app creates many notifications for another recipient. Counting through
-- poputchiki_app is RLS-filtered by app.current_user_id(), so cross-recipient
-- throttle checks can see zero rows. Keep the anti-spam decision in a
-- SECURITY DEFINER function owned by poputchiki_service (BYPASSRLS), and do
-- count + insert + pg_notify as one statement.

GRANT SELECT, INSERT ON user_notifications TO poputchiki_service;

CREATE OR REPLACE FUNCTION app.enqueue_user_notification(
  p_user_id uuid,
  p_category text,
  p_ride_id uuid,
  p_data jsonb,
  p_hourly_limit integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app
AS $$
DECLARE
  v_count integer;
  v_payload text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'enqueue_user_notification: user_id required';
  END IF;

  -- Serialize per recipient/category so concurrent spam cannot race past the
  -- rolling one-hour limit with many simultaneous COUNT-before-INSERT calls.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_category, 0));

  IF p_hourly_limit IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_count
    FROM user_notifications
    WHERE user_id = p_user_id
      AND category = p_category
      AND created_at > now() - INTERVAL '1 hour';

    IF v_count >= p_hourly_limit THEN
      RETURN false;
    END IF;
  END IF;

  INSERT INTO user_notifications (user_id, category, ride_id, data)
  VALUES (p_user_id, p_category, p_ride_id, COALESCE(p_data, '{}'::jsonb));

  v_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'user_id', p_user_id,
      'category', p_category,
      'ride_id', p_ride_id
    ) || COALESCE(p_data, '{}'::jsonb)
  )::text;

  PERFORM pg_notify('notify_user', v_payload);
  RETURN true;
END;
$$;

ALTER FUNCTION app.enqueue_user_notification(uuid, text, uuid, jsonb, integer) OWNER TO poputchiki_service;
GRANT EXECUTE ON FUNCTION app.enqueue_user_notification(uuid, text, uuid, jsonb, integer) TO poputchiki_app;
GRANT EXECUTE ON FUNCTION app.enqueue_user_notification(uuid, text, uuid, jsonb, integer) TO poputchiki_service;
