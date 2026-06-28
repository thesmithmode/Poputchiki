-- Migration 023: split avg_stars into driver_avg_stars / passenger_avg_stars
-- Adds per-role rating columns to users, updates trigger + user_stats MV.
-- Review is "as driver" when target_id = rides.driver_id for that ride.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS driver_avg_stars    numeric(3,2),
  ADD COLUMN IF NOT EXISTS passenger_avg_stars numeric(3,2),
  ADD COLUMN IF NOT EXISTS driver_reviews_count   int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS passenger_reviews_count int NOT NULL DEFAULT 0;

-- Update trigger to compute split values
CREATE OR REPLACE FUNCTION app.update_user_avg_stars()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_target_id uuid;
BEGIN
  v_target_id := COALESCE(NEW.target_id, OLD.target_id);

  UPDATE users
  SET
    avg_stars              = sub.avg_all,
    reviews_count          = sub.cnt_all,
    driver_avg_stars       = sub.avg_drv,
    passenger_avg_stars    = sub.avg_pax,
    driver_reviews_count   = sub.cnt_drv,
    passenger_reviews_count = sub.cnt_pax
  FROM (
    SELECT
      AVG(r.stars)::numeric(3,2)                                          AS avg_all,
      COUNT(r.id)::int                                                    AS cnt_all,
      AVG(r.stars) FILTER (WHERE ri.driver_id = v_target_id)::numeric(3,2) AS avg_drv,
      AVG(r.stars) FILTER (WHERE ri.driver_id <> v_target_id)::numeric(3,2) AS avg_pax,
      COUNT(r.id) FILTER (WHERE ri.driver_id = v_target_id)::int         AS cnt_drv,
      COUNT(r.id) FILTER (WHERE ri.driver_id <> v_target_id)::int        AS cnt_pax
    FROM reviews r
    JOIN rides ri ON ri.id = r.ride_id
    WHERE r.target_id = v_target_id
  ) sub
  WHERE id = v_target_id;

  RETURN NULL;
END;
$$;

-- Recreate user_stats MV with split columns
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
    SELECT
      rv.target_id AS user_id,
      AVG(rv.stars) AS avg_stars,
      COUNT(*)::int AS reviews_count,
      AVG(rv.stars) FILTER (WHERE ri.driver_id = rv.target_id) AS driver_avg_stars,
      AVG(rv.stars) FILTER (WHERE ri.driver_id <> rv.target_id) AS passenger_avg_stars,
      COUNT(*) FILTER (WHERE ri.driver_id = rv.target_id)::int AS driver_reviews_count,
      COUNT(*) FILTER (WHERE ri.driver_id <> rv.target_id)::int AS passenger_reviews_count
    FROM reviews rv
    JOIN rides ri ON ri.id = rv.ride_id
    GROUP BY rv.target_id
  )
SELECT
  u.id AS user_id,
  COALESCE(dr.rides_as_driver_completed, 0) AS rides_as_driver_completed,
  COALESCE(pr.rides_as_passenger, 0)        AS rides_as_passenger,
  COALESCE(lr.likes_received, 0)            AS likes_received,
  rs.avg_stars                              AS avg_stars,
  COALESCE(rs.reviews_count, 0)             AS reviews_count,
  rs.driver_avg_stars                       AS driver_avg_stars,
  rs.passenger_avg_stars                    AS passenger_avg_stars,
  COALESCE(rs.driver_reviews_count, 0)      AS driver_reviews_count,
  COALESCE(rs.passenger_reviews_count, 0)   AS passenger_reviews_count
FROM users u
LEFT JOIN driver_rides dr    ON dr.user_id = u.id
LEFT JOIN passenger_rides pr ON pr.user_id = u.id
LEFT JOIN likes_received lr  ON lr.user_id = u.id
LEFT JOIN review_stats rs    ON rs.user_id = u.id;

CREATE UNIQUE INDEX user_stats_user_id_uniq ON user_stats (user_id);

-- Backfill: recalculate all users with existing reviews
UPDATE users u
SET
  avg_stars              = sub.avg_all,
  reviews_count          = sub.cnt_all,
  driver_avg_stars       = sub.avg_drv,
  passenger_avg_stars    = sub.avg_pax,
  driver_reviews_count   = sub.cnt_drv,
  passenger_reviews_count = sub.cnt_pax
FROM (
  SELECT
    r.target_id,
    AVG(r.stars)::numeric(3,2)                                               AS avg_all,
    COUNT(r.id)::int                                                         AS cnt_all,
    AVG(r.stars) FILTER (WHERE ri.driver_id = r.target_id)::numeric(3,2)    AS avg_drv,
    AVG(r.stars) FILTER (WHERE ri.driver_id <> r.target_id)::numeric(3,2)   AS avg_pax,
    COUNT(r.id) FILTER (WHERE ri.driver_id = r.target_id)::int              AS cnt_drv,
    COUNT(r.id) FILTER (WHERE ri.driver_id <> r.target_id)::int             AS cnt_pax
  FROM reviews r
  JOIN rides ri ON ri.id = r.ride_id
  GROUP BY r.target_id
) sub
WHERE u.id = sub.target_id;
