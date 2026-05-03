-- Migration 010: materialized view user_stats (refresh CONCURRENTLY каждые 5 мин cron worker)
-- См. SPEC §4.2

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
