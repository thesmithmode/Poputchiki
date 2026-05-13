-- Init: создание ролей приложения для Poputchiki
-- Запускается один раз при первом старте контейнера через /docker-entrypoint-initdb.d/
-- ВАЖНО: пароли задаются через ENV переменные APP_DB_PASSWORD и SERVICE_DB_PASSWORD

-- -----------------------------------------------------------------------
-- poputchiki_app: основная роль для API/notifier/cron/webhook
-- LOGIN + NOINHERIT (не наследует привилегии групп автоматически)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'poputchiki_app') THEN
    CREATE ROLE poputchiki_app WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- -----------------------------------------------------------------------
-- poputchiki_service: привилегированная сервисная роль для cron-cleanup,
-- backup, notifier и прочих системных операций.
-- Без LOGIN — используется через SET LOCAL ROLE из poputchiki_app транзакции.
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'poputchiki_service') THEN
    CREATE ROLE poputchiki_service NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- poputchiki_app может эскалировать до poputchiki_service через SET LOCAL ROLE
GRANT poputchiki_service TO poputchiki_app;

-- -----------------------------------------------------------------------
-- Доступ к БД и схемам
-- -----------------------------------------------------------------------
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO poputchiki_app', current_database()); END $$;
GRANT USAGE ON SCHEMA public TO poputchiki_app;
GRANT USAGE ON SCHEMA public TO poputchiki_service;

-- Существующие таблицы и последовательности
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO poputchiki_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO poputchiki_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO poputchiki_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO poputchiki_service;

-- Будущие таблицы и последовательности
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poputchiki_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO poputchiki_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO poputchiki_service;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO poputchiki_service;

-- -----------------------------------------------------------------------
-- Устаревшая роль 'app' — оставлена для совместимости, не используется
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app WITH NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;
-- DEPRECATED: роль 'app' не используется кодом приложения (используется poputchiki_app)
