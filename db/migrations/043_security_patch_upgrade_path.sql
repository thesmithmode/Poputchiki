-- Migration 043: restore standalone upgrade path for security patches that were
-- folded into already-applied migrations during pre-deploy refactoring.
--
-- node-pg-migrate records applied migrations by filename, so databases that had
-- already applied 002/003/007 before that refactor would otherwise skip these
-- controls. Keep this migration idempotent: fresh databases have the same
-- objects from earlier migrations, while partially migrated databases receive
-- the missing hardening here.

-- app.book_seat: current SETOF implementation used by the API request flow.
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

REVOKE ALL ON FUNCTION app.book_seat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.book_seat(uuid) TO poputchiki_app;

-- Antispam: one complaint per reporter-target pair per calendar week.
CREATE OR REPLACE FUNCTION complaint_week_utc(ts timestamptz)
RETURNS timestamp AS $$
  SELECT date_trunc('week', (ts AT TIME ZONE 'UTC'));
$$ LANGUAGE sql IMMUTABLE;

CREATE UNIQUE INDEX IF NOT EXISTS complaints_unique_per_week_idx
  ON complaints (
    reporter_id,
    target_id,
    COALESCE(ride_id, '00000000-0000-0000-0000-000000000000'::uuid),
    complaint_week_utc(created_at)
  );

-- SECURITY DEFINER counter triggers: update users rows for other users under FORCE RLS.
CREATE OR REPLACE FUNCTION app.trg_likes_update_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE users SET likes_received_count = likes_received_count + 1
    WHERE id = NEW.target_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE users SET likes_received_count = GREATEST(0, likes_received_count - 1)
    WHERE id = OLD.target_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_rides_insert_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE users SET rides_total_count = rides_total_count + 1
  WHERE id = NEW.driver_id;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.trg_rides_completed_count()
  RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    UPDATE users SET rides_completed_count = rides_completed_count + 1
    WHERE id = NEW.driver_id;
  END IF;
  RETURN NULL;
END;
$$;
