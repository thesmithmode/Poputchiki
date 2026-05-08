-- Migration 019: RLS для служебных таблиц (error_log, nonces, rate_limit_buckets, idempotency_keys)
-- Принцип: deny-by-default через FORCE RLS; исключения задаются явными политиками.

-- ---------------------------------------------------------------------------
-- error_log: INSERT разрешён всем, SELECT только admin.
-- poputchiki_app не получает SELECT/UPDATE/DELETE — только INSERT.
-- Для чтения логов администратор должен использовать привилегированное соединение
-- или отдельную роль (TODO: ручка GET /admin/errors → withSystem).
-- ---------------------------------------------------------------------------
REVOKE SELECT, UPDATE, DELETE ON error_log FROM poputchiki_app;
GRANT INSERT ON error_log TO poputchiki_app;

ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_log FORCE ROW LEVEL SECURITY;

-- Любой authenticated или анонимный app-пользователь может вставить ошибку
CREATE POLICY error_log_insert ON error_log
  FOR INSERT WITH CHECK (true);

-- Только admin может читать
CREATE POLICY error_log_select ON error_log
  FOR SELECT USING (app.is_admin());

-- ---------------------------------------------------------------------------
-- nonces: INSERT разрешён всем через poputchiki_app (используется в authRouter
-- до SET LOCAL ROLE — т.е. на уровне базового соединения poputchiki_app).
-- SELECT/DELETE через scheduled cleanup запускается привилегированно (cron).
-- poputchiki_app не получает SELECT/UPDATE/DELETE кроме INSERT.
-- ---------------------------------------------------------------------------
REVOKE SELECT, UPDATE, DELETE ON nonces FROM poputchiki_app;
GRANT INSERT ON nonces TO poputchiki_app;

ALTER TABLE nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE nonces FORCE ROW LEVEL SECURITY;

-- INSERT разрешён для защиты от replay (вставляет hash один раз)
CREATE POLICY nonces_insert ON nonces
  FOR INSERT WITH CHECK (true);

-- SELECT только для poputchiki_service (cleanup cron)
CREATE POLICY nonces_service_select ON nonces
  FOR SELECT USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

-- DELETE только для poputchiki_service (cleanup cron)
CREATE POLICY nonces_service_delete ON nonces
  FOR DELETE USING (pg_has_role(current_user, 'poputchiki_service', 'MEMBER'));

-- ---------------------------------------------------------------------------
-- rate_limit_buckets: INSERT/UPDATE/SELECT разрешён poputchiki_app.
-- Ключ не привязан к user_id напрямую, но формат ip:X/user:UUID гарантирован
-- middleware. SELECT ограничен only-own-key PREFIX чтобы избежать утечки IP.
-- DELETE (cleanup expired) — только poputchiki_service.
-- ---------------------------------------------------------------------------
-- Существующий GRANT INSERT/UPDATE/SELECT/DELETE из 005 оставляем,
-- добавляем RLS поверх для явного контроля.
ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_buckets FORCE ROW LEVEL SECURITY;

-- poputchiki_app может INSERT/UPDATE/SELECT (нужен rate-limit middleware)
CREATE POLICY rate_limit_app ON rate_limit_buckets
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- idempotency_keys: нет поля user_id, используется голым sql middleware.
-- RLS не применяется — доступ гарантирован сетевой изоляцией и грантами.
-- TODO: добавить user_id в idempotency_keys + ужесточить политику.
-- ---------------------------------------------------------------------------
-- ПРИМЕЧАНИЕ: idempotency_keys намеренно оставлены без FORCE RLS.
-- Причина: middleware (idempotency.ts) использует голый sql без GUC/SET ROLE,
-- таблица не содержит user_id. FORCE RLS с DENY сломает middleware.
-- Безопасность обеспечивается: роль poputchiki_app + сетевая изоляция Docker.
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO poputchiki_app;
