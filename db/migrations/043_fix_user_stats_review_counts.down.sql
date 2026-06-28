-- Rollback 043: keep fanout-safe user_stats aggregation when rolling back metadata changes.

DROP VIEW IF EXISTS user_stats_view;
DROP MATERIALIZED VIEW IF EXISTS user_stats;

CREATE MATERIALIZED VIEW user_stats AS
SELECT
  u.id AS user_id,
  COUNT(DISTINCT r_drv.id) FILTER (WHERE r_drv.status = 'completed') AS rides_as_driver_completed,
  COUNT(DISTINCT rp.ride_id)                                          AS rides_as_passenger,
  COALESCE(SUM(CASE WHEN l.target_id = u.id THEN 1 ELSE 0 END), 0)  AS likes_received,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id)                   AS avg_stars,
  COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id)          AS reviews_count,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id = u.id)  AS driver_avg_stars,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id <> u.id) AS passenger_avg_stars,
  COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id = u.id)::int  AS driver_reviews_count,
  COUNT(DISTINCT rv.id)  FILTER (WHERE rv.target_id = u.id AND ri_rv.driver_id <> u.id)::int AS passenger_reviews_count
FROM users u
LEFT JOIN rides r_drv           ON r_drv.driver_id = u.id
LEFT JOIN ride_participation rp ON rp.passenger_id = u.id AND rp.passenger_confirmed
LEFT JOIN likes l               ON l.target_id = u.id
LEFT JOIN reviews rv            ON rv.target_id = u.id
LEFT JOIN rides ri_rv           ON ri_rv.id = rv.ride_id
GROUP BY u.id;

CREATE UNIQUE INDEX user_stats_user_id_uniq ON user_stats (user_id);

REVOKE SELECT ON user_stats FROM poputchiki_app;
CREATE VIEW user_stats_view AS SELECT * FROM user_stats;
GRANT SELECT ON user_stats_view TO poputchiki_app;
