-- Migration 031: harden likes/reviews RLS with confirmed ride participation

-- A subject can socially rate only the driver/passenger they completed a ride with.
-- The passenger side must be confirmed by both parties; this prevents forged
-- likes/reviews for arbitrary rides or users when an app session sets its own GUC.
CREATE OR REPLACE FUNCTION app.can_socially_rate_ride(p_ride_id uuid, p_subject_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rides r
    JOIN ride_participation rp ON rp.ride_id = r.id
    WHERE r.id = p_ride_id
      AND rp.driver_marked = true
      AND rp.passenger_confirmed = true
      AND (
        (r.driver_id = p_subject_id AND rp.passenger_id = p_target_id)
        OR (rp.passenger_id = p_subject_id AND r.driver_id = p_target_id)
      )
  );
$$;

DROP POLICY IF EXISTS likes_insert ON likes;
CREATE POLICY likes_insert ON likes
  FOR INSERT WITH CHECK (
    subject_id = app.current_user_id()
    AND app.can_socially_rate_ride(ride_id, subject_id, target_id)
  );

DROP POLICY IF EXISTS reviews_insert ON reviews;
CREATE POLICY reviews_insert ON reviews
  FOR INSERT WITH CHECK (
    subject_id = app.current_user_id()
    AND app.can_socially_rate_ride(ride_id, subject_id, target_id)
  );
