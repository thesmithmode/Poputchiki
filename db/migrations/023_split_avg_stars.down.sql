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
SELECT
  u.id AS user_id,
  COUNT(DISTINCT r_drv.id) FILTER (WHERE r_drv.status='completed') AS rides_as_driver_completed,
  COUNT(DISTINCT rp.ride_id)                                       AS rides_as_passenger,
  COALESCE(SUM(CASE WHEN l.target_id = u.id THEN 1 ELSE 0 END), 0) AS likes_received,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id)                 AS avg_stars,
  COUNT(rv.id) FILTER (WHERE rv.target_id = u.id)                  AS reviews_count
FROM users u
LEFT JOIN rides r_drv               ON r_drv.driver_id = u.id
LEFT JOIN ride_participation rp     ON rp.passenger_id = u.id AND rp.passenger_confirmed
LEFT JOIN likes l                   ON l.target_id = u.id
LEFT JOIN reviews rv                ON rv.target_id = u.id
GROUP BY u.id;

CREATE UNIQUE INDEX user_stats_user_id_uniq ON user_stats (user_id);

ALTER TABLE users
  DROP COLUMN IF EXISTS driver_avg_stars,
  DROP COLUMN IF EXISTS passenger_avg_stars,
  DROP COLUMN IF EXISTS driver_reviews_count,
  DROP COLUMN IF EXISTS passenger_reviews_count;
