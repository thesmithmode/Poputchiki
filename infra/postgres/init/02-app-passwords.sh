#!/bin/bash
# Устанавливает пароли для ролей приложения из ENV.
# Запускается один раз при первом старте контейнера через /docker-entrypoint-initdb.d/
# Выполняется после 01-app-role.sql (алфавитный порядок).

set -euo pipefail

APP_PASSWORD="${APP_DB_PASSWORD:-}"
SERVICE_PASSWORD="${SERVICE_DB_PASSWORD:-}"

if [ -n "$APP_PASSWORD" ]; then
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    -c "ALTER ROLE poputchiki_app WITH PASSWORD '$APP_PASSWORD';"
  echo "[init] poputchiki_app: пароль установлен"
else
  echo "[init] APP_DB_PASSWORD не задан — poputchiki_app без пароля (только local dev)"
fi

# poputchiki_service: NOLOGIN — пароль не нужен, роль используется через SET LOCAL ROLE
echo "[init] poputchiki_service: NOLOGIN, пароль не требуется"
