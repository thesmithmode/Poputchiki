-- Revert: restore driver-exclusion check in book_seat.
CREATE OR REPLACE FUNCTION app.book_seat(p_ride_id uuid)
RETURNS SETOF public.rides
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE public.rides
     SET seats_taken = public.rides.seats_taken + 1
   WHERE public.rides.id = p_ride_id
     AND public.rides.status = 'active'
     AND public.rides.seats_taken < public.rides.seats_total
     AND app.current_user_id() IS NOT NULL
     AND public.rides.driver_id <> app.current_user_id()
  RETURNING public.rides.*;
$$;
