-- Migration 012: app.unbook_seat — обратная операция к app.book_seat.
-- Используется при reject (driver) или cancel (passenger) для возврата места.
-- SECURITY DEFINER, обходит RLS на rides (driver-only UPDATE policy).

CREATE FUNCTION app.unbook_seat(p_ride_id uuid)
RETURNS SETOF rides
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE rides
     SET seats_taken = GREATEST(rides.seats_taken - 1, 0)
   WHERE rides.id = p_ride_id
     AND app.current_user_id() IS NOT NULL
  RETURNING rides.*;
$$;

REVOKE ALL ON FUNCTION app.unbook_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.unbook_seat(uuid) TO poputchiki_app;
