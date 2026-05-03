-- Migration 012: переписать app.book_seat() как SQL function SETOF rides.
--
-- Why: prior plpgsql RETURN QUERY UPDATE ... RETURNING form returned 0 rows in
-- concurrent CI runs despite all WHERE conditions being met. Switch to a plain
-- SQL function — same SECURITY DEFINER, simpler optimizer plan, no plpgsql DECLARE
-- intermediate that could silently NULL out v_caller in some edge.
--
-- Identity check moved into WHERE: the GUC must resolve to a non-null uuid that
-- differs from driver_id; otherwise no row matches and the caller maps it to
-- NO_SEATS, which is the correct semantic for "you cannot book this".

DROP FUNCTION IF EXISTS app.book_seat(uuid);

CREATE FUNCTION app.book_seat(p_ride_id uuid)
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

REVOKE ALL ON FUNCTION app.book_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.book_seat(uuid) TO poputchiki_app;
