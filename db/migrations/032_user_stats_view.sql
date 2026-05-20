-- Migration 032: user_stats — REVOKE прямой SELECT + SECURITY DEFINER view
--
-- Причина (review 2026-05-20 shared-db H2):
-- PostgreSQL 16 не поддерживает RLS на материализованных представлениях.
-- DEFAULT PRIVILEGES в 000 выдают SELECT на user_stats для poputchiki_app,
-- что позволяет любому аутентифицированному пользователю сделать
-- SELECT * FROM user_stats и сдампить агрегаты всех пользователей разом.
--
-- Решение: отозвать прямой SELECT, оставить доступ только через view.
-- VIEW по умолчанию SECURITY DEFINER (security_invoker=false в PG15+) —
-- проверка прав на underlying user_stats делается от имени OWNER view,
-- не от вызывающего. Owner здесь postgres → SELECT на MV проходит.
-- Прямой SELECT FROM user_stats под poputchiki_app → permission denied.
--
-- NOTE: view всё равно отдаёт SELECT * по любому фильтру — это не полная
-- защита, а raised bar. Полное решение (функция get_user_stats(target uuid)
-- с проверкой ownership + публичных полей) — отдельный финдинг.
--
-- NOTE: cron REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats работает через
-- poputchiki_service (BYPASSRLS), прямой доступ к MV для него сохраняется.

REVOKE SELECT ON user_stats FROM poputchiki_app;

CREATE VIEW user_stats_view AS SELECT * FROM user_stats;

GRANT SELECT ON user_stats_view TO poputchiki_app;
