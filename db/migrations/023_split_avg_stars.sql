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
SELECT
  u.id AS user_id,
  COUNT(DISTINCT r_drv.id) FILTER (WHERE r_drv.status = 'completed') AS rides_as_driver_completed,
  COUNT(DISTINCT rp.ride_id)                                          AS rides_as_passenger,
  COALESCE(SUM(CASE WHEN l.target_id = u.id THEN 1 ELSE 0 END), 0)  AS likes_received,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id)                   AS avg_stars,
  COUNT(rv.id)  FILTER (WHERE rv.target_id = u.id)                   AS reviews_count,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id = u.id)  AS driver_avg_stars,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id <> u.id) AS passenger_avg_stars,
  COUNT(rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id = u.id)::int  AS driver_reviews_count,
  COUNT(rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id <> u.id)::int AS passenger_reviews_count
FROM users u
LEFT JOIN rides r_drv           ON r_drv.driver_id = u.id
LEFT JOIN ride_participation rp ON rp.passenger_id = u.id AND rp.passenger_confirmed
LEFT JOIN likes l               ON l.target_id = u.id
LEFT JOIN reviews rv            ON rv.target_id = u.id
LEFT JOIN rides ri_rv           ON ri_rv.id = rv.ride_id
GROUP BY u.id;

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
