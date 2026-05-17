-- Revert: restore driver-exclusion check in book_seat.
CREATE OR REPLACE FUNCTION app.book_seat(p_ride_id uuid)
RETURNS SETOF rides
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE rides
     SET seats_taken = rides.seats_taken + 1
   WHERE rides.id = p_ride_id
     AND rides.status = 'active'
     AND rides.seats_taken < rides.seats_total
     AND app.current_user_id() IS NOT NULL
     AND rides.driver_id <> app.current_user_id()
  RETURNING rides.*;
$$;
