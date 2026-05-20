-- Rollback 032: восстановить прямой SELECT на user_stats, удалить view
DROP VIEW IF EXISTS user_stats_view;
GRANT SELECT ON user_stats TO poputchiki_app;
