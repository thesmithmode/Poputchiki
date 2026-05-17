-- Fix: book_seat was rejecting calls from the driver (rides.driver_id <> current_user_id()).
-- In the new flow, the driver accepts the passenger request → book_seat is called as the driver.
-- Authorization is enforced at the router level; this function only needs to check capacity.
CREATE OR REPLACE FUNCTION app.book_seat(p_ride_id uuid)
RETURNS SETOF rides
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE rides
     SET seats_taken = rides.seats_taken + 1
   WHERE rides.id = p_ride_id
     AND rides.status = 'active'
     AND rides.seats_taken < rides.seats_total
     AND app.current_user_id() IS NOT NULL
  RETURNING rides.*;
$$;
