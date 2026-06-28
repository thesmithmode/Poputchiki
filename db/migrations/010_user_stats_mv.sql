-- Migration 010: materialized view user_stats (refresh CONCURRENTLY каждые 5 мин cron worker)
-- См. SPEC §4.2

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
