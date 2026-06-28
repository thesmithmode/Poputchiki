-- Rollback 023: restore original avg_stars trigger + user_stats MV

CREATE OR REPLACE FUNCTION app.update_user_avg_stars()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_target_id uuid;
BEGIN
  v_target_id := COALESCE(NEW.target_id, OLD.target_id);

  UPDATE users
  SET
    avg_stars    = sub.avg_val,
    reviews_count = sub.cnt
  FROM (
    SELECT
      AVG(stars)::numeric(3,2) AS avg_val,
      COUNT(*)::int              AS cnt
    FROM reviews
    WHERE target_id = v_target_id
  ) sub
  WHERE id = v_target_id;

  RETURN NULL;
END;
$$;

DROP MATERIALIZED VIEW IF EXISTS user_stats;

CREATE MATERIALIZED VIEW user_stats AS
WITH
  driver_rides AS (
    SELECT driver_id AS user_id, COUNT(*)::int AS rides_as_driver_completed
    FROM rides
    WHERE status = 'completed'
    GROUP BY driver_id
  ),
  passenger_rides AS (
    SELECT passenger_id AS user_id, COUNT(DISTINCT ride_id)::int AS rides_as_passenger
    FROM ride_participation
    WHERE passenger_confirmed
    GROUP BY passenger_id
  ),
  likes_received AS (
    SELECT target_id AS user_id, COUNT(*)::int AS likes_received
    FROM likes
    GROUP BY target_id
  ),
  review_stats AS (
    SELECT target_id AS user_id, AVG(stars) AS avg_stars, COUNT(*)::int AS reviews_count
    FROM reviews
    GROUP BY target_id
  )
SELECT
  u.id AS user_id,
  COALESCE(dr.rides_as_driver_completed, 0) AS rides_as_driver_completed,
  COALESCE(pr.rides_as_passenger, 0)        AS rides_as_passenger,
  COALESCE(lr.likes_received, 0)            AS likes_received,
  rs.avg_stars                              AS avg_stars,
  COALESCE(rs.reviews_count, 0)             AS reviews_count
FROM users u
LEFT JOIN driver_rides dr    ON dr.user_id = u.id
LEFT JOIN passenger_rides pr ON pr.user_id = u.id
LEFT JOIN likes_received lr  ON lr.user_id = u.id
LEFT JOIN review_stats rs    ON rs.user_id = u.id;

CREATE UNIQUE INDEX user_stats_user_id_uniq ON user_stats (user_id);

ALTER TABLE users
  DROP COLUMN IF EXISTS driver_avg_stars,
  DROP COLUMN IF EXISTS passenger_avg_stars,
  DROP COLUMN IF EXISTS driver_reviews_count,
  DROP COLUMN IF EXISTS passenger_reviews_count;
