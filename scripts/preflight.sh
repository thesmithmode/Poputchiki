#!/usr/bin/env bash
# chmod +x scripts/preflight.sh
# Запуск: DOMAIN=poputchiki.example.com bash scripts/preflight.sh
# Проверяет готовность сервера к первому деплою Poputchiki

set -euo pipefail

DOMAIN="${DOMAIN:-poputchiki.searchingforgamesforever.online}"
HOST="${HOST:-$DOMAIN}"
ENV_FILE="${ENV_FILE:-/opt/poputchiki/.env}"
BACKUPS_DIR="${BACKUPS_DIR:-/opt/poputchiki/backups}"
MIN_DISK_GB=5

FAILURES=0

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; FAILURES=$((FAILURES + 1)); }

# 1. DNS resolve
for sub in api app webhook; do
  fqdn="${sub}.${DOMAIN}"
  result=$(dig +short "$fqdn" 2>/dev/null | head -1)
  if [ -n "$result" ]; then
    pass "DNS $fqdn → $result"
  else
    fail "DNS $fqdn не резолвится"
  fi
done

# 2. Port 443 open
if nc -zw5 "$HOST" 443 2>/dev/null; then
  pass "Port 443 открыт на $HOST"
else
  fail "Port 443 недоступен на $HOST"
fi

# 3. Traefik running
if docker ps 2>/dev/null | grep -q traefik; then
  pass "Traefik контейнер запущен"
else
  fail "Traefik не найден в docker ps"
fi

# 4. Disk space >= 5GB on /opt
avail_kb=$(df /opt 2>/dev/null | awk 'NR==2 {print $4}')
avail_gb=$(( avail_kb / 1024 / 1024 ))
if [ "$avail_gb" -ge "$MIN_DISK_GB" ]; then
  pass "Диск /opt: ${avail_gb}GB свободно (минимум ${MIN_DISK_GB}GB)"
else
  fail "Диск /opt: только ${avail_gb}GB свободно, нужно ≥${MIN_DISK_GB}GB"
fi

# 5. Required env vars in .env file
REQUIRED_VARS="POSTGRES_PASSWORD JWT_SECRET BOT_TOKEN BACKUP_KEY PGCRYPTO_KEY"
if [ -f "$ENV_FILE" ]; then
  for var in $REQUIRED_VARS; do
    if grep -qE "^${var}=.+" "$ENV_FILE" 2>/dev/null; then
      pass "Env var $var присутствует в $ENV_FILE"
    else
      fail "Env var $var отсутствует или пустая в $ENV_FILE"
    fi
  done
else
  fail "Файл $ENV_FILE не найден"
  for var in $REQUIRED_VARS; do
    fail "Env var $var — не проверена (файл отсутствует)"
  done
fi

# 6. Backups directory writable
if [ -d "$BACKUPS_DIR" ] && [ -w "$BACKUPS_DIR" ]; then
  pass "Директория $BACKUPS_DIR существует и доступна для записи"
elif [ -d "$BACKUPS_DIR" ]; then
  fail "Директория $BACKUPS_DIR существует, но не доступна для записи"
else
  fail "Директория $BACKUPS_DIR не существует"
fi

# 7. Docker compose plugin
if docker compose version >/dev/null 2>&1; then
  ver=$(docker compose version 2>/dev/null | head -1)
  pass "Docker Compose plugin: $ver"
else
  fail "Docker compose plugin недоступен"
fi

# 8. GHCR login / image pull attempt
echo "INFO: Попытка docker pull ghcr.io/thesmithmode/poputchiki-api:latest ..."
if docker pull ghcr.io/thesmithmode/poputchiki-api:latest 2>/dev/null; then
  pass "GHCR pull ghcr.io/thesmithmode/poputchiki-api:latest — успешно"
else
  echo "INFO: GHCR pull не удался — образ ещё не опубликован или нет доступа (не критично до первого деплоя)"
fi

# Summary
echo ""
echo "========================================"
if [ "$FAILURES" -eq 0 ]; then
  echo "RESULT: ВСЕ ПРОВЕРКИ ПРОШЛИ — сервер готов к деплою"
  exit 0
else
  echo "RESULT: ПРОВАЛЕНО $FAILURES ПРОВЕРОК — устраните ошибки перед деплоем"
  exit 1
fi
