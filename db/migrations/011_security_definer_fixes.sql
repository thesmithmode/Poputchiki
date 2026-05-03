-- Migration 011: SECURITY DEFINER fixes for trigger functions and seat booking.
--
-- Why: counter triggers in 007 update users.X_count for OTHER users (e.g. likes
-- target_id != caller). Under RLS FORCE the UPDATE is filtered by users_update_self
-- and silently affects 0 rows → counter drift. Same for /rides/:id/request:
-- passenger UPDATE on rides.seats_taken is blocked by rides_update (driver-only).
--
-- Fix: trigger functions run as SECURITY DEFINER (owner = superuser, bypasses RLS).
-- Seat booking goes through app.book_seat() — a SECURITY DEFINER function that
-- enforces business rules (active, seats_taken<seats_total, caller != driver)
-- explicitly instead of relying on RLS that's tuned for driver-only edits.

ALTER FUNCTION app.trg_likes_update_count() SECURITY DEFINER SET search_path = pg_catalog, public;
ALTER FUNCTION app.trg_rides_insert_count() SECURITY DEFINER SET search_path = pg_catalog, public;
ALTER FUNCTION app.trg_rides_completed_count() SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION app.book_seat(p_ride_id uuid)
RETURNS TABLE(id uuid, driver_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_caller uuid := app.current_user_id();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'no_identity' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    UPDATE rides
       SET seats_taken = rides.seats_taken + 1
     WHERE rides.id = p_ride_id
       AND rides.status = 'active'
       AND rides.seats_taken < rides.seats_total
       AND rides.driver_id <> v_caller
    RETURNING rides.id, rides.driver_id;
END;
$$;

REVOKE ALL ON FUNCTION app.book_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.book_seat(uuid) TO poputchiki_app;
