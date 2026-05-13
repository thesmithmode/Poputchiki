#!/usr/bin/env bash
# Атомарний деплой: backup → pull → migrate → up → healthcheck → tag
# Usage: deploy.sh <SHA>
set -euo pipefail

[[ $# -lt 1 ]] && { echo "Usage: $0 <SHA>" >&2; exit 1; }
SHA="$1"
STATE_DIR="/opt/poputchiki"
COMPOSE="docker compose -f $STATE_DIR/infra/docker-compose.prod.yml --env-file $STATE_DIR/.env"
TAGS_DIR="$STATE_DIR"

mkdir -p "$STATE_DIR"

# Загружаем .env чтобы backup-db.sh и остальные скрипты имели доступ к DATABASE_URL и BACKUP_KEY
set -o allexport
# shellcheck source=/dev/null
source "$STATE_DIR/.env"
set +o allexport
# IMAGE_TAG всегда из аргумента — перекрывает любое значение из .env
IMAGE_TAG="$SHA"

# Установить pg_dump если отсутствует (нужен для backup-db.sh)
if ! command -v pg_dump &>/dev/null; then
  apt-get update -qq && apt-get install -y -qq postgresql-client-16
fi

echo "=== deploy $SHA ==="

# Убедиться что Traefik запущен (идемпотентно, не зависит от IMAGE_TAG)
echo "--- [0/7] ensure traefik ---"
$COMPOSE up -d traefik

# Шаг 1: бэкап делает cron в 4:00 ежедневно — здесь пропускаем
echo "--- [1/7] backup skipped (cron handles daily at 04:00) ---"

# Шаг 2: pull images
echo "--- [2/7] docker pull ---"
for i in 1 2 3; do
  IMAGE_TAG="$SHA" $COMPOSE pull && break
  echo "Pull attempt $i failed, retrying in 30s..."
  sleep 30
done

# Шаг 3: migrate (одноразовый контейнер с superuser-подключением)
echo "--- [3/7] migrate ---"
# Сначала убедиться что postgres healthy (docker compose run не ждёт depends_on healthy)
$COMPOSE up -d --wait postgres
IMAGE_TAG="$SHA" $COMPOSE --profile migrations run --rm migrations

# Шаг 4: rolling restart сервисов (postgres не трогаем)
echo "--- [4/7] up services ---"
PREVIOUS_TAG=$(cat "$TAGS_DIR/current-tag" 2>/dev/null || echo "")
IMAGE_TAG="$SHA" $COMPOSE up -d --no-deps api notifier cron webhook web

# Шаг 5: ждать healthcheck
echo "--- [5/7] healthcheck (60s) ---"
SERVICES=(api notifier cron webhook web)
DEADLINE=$((SECONDS + 60))
for SVC in "${SERVICES[@]}"; do
  while true; do
    STATUS=$(IMAGE_TAG="$SHA" $COMPOSE ps --format json "$SVC" 2>/dev/null \
      | grep -oE '"Health":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [[ "$STATUS" == "healthy" ]]; then
      echo "$SVC healthy"
      break
    fi
    if [[ $SECONDS -ge $DEADLINE ]]; then
      echo "ERROR: $SVC not healthy after 60s" >&2
      if [[ -n "$PREVIOUS_TAG" ]]; then
        bash "$STATE_DIR/scripts/rollback.sh" "$PREVIOUS_TAG" || true
      else
        echo "WARNING: first deploy, no rollback tag" >&2
        bash "$STATE_DIR/scripts/notify-admin.sh" "CRITICAL: first deploy failed, manual intervention required" || true
      fi
      exit 1
    fi
    sleep 3
  done
done

# Шаг 6: обновить теги
echo "--- [6/7] update tags ---"
[[ -n "$PREVIOUS_TAG" ]] && echo "$PREVIOUS_TAG" > "$TAGS_DIR/last-good-tag"
echo "$SHA" > "$TAGS_DIR/current-tag"

# Шаг 7: cleanup
echo "--- [7/7] cleanup images ---"
KEEP_TAG=$(cat "$TAGS_DIR/last-good-tag" 2>/dev/null || echo "")
for IMAGE in poputchiki-api poputchiki-notifier poputchiki-cron poputchiki-webhook poputchiki-web; do
  docker images "ghcr.io/thesmithmode/${IMAGE}" --format "{{.ID}} {{.Tag}}" \
    | sort -k2 \
    | awk -v keep="$KEEP_TAG" '$2 != keep' \
    | head -n -5 \
    | awk '{print $1}' \
    | xargs --no-run-if-empty docker rmi -f 2>/dev/null || true
done
# Удалить только dangling образы без тега (безопасно — не трогает чужие контейнеры)
docker image prune -f --filter "dangling=true" 2>/dev/null || true

echo "=== deploy $SHA SUCCESS ==="
bash "$STATE_DIR/scripts/notify-admin.sh" "deploy ${SHA:0:8} success" || true
