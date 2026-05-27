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

# backup-db.sh выполняет pg_dump внутри postgres-контейнера через docker exec.
# zstd и gpg нужны на хосте для pipe-обработки stdout.
for pkg in zstd gpg; do
  if ! command -v "$pkg" &>/dev/null; then
    apt-get update -qq && apt-get install -y -qq zstd gnupg
    break
  fi
done

echo "=== deploy $SHA ==="

# Убедиться что Traefik запущен (идемпотентно, не зависит от IMAGE_TAG)
echo "--- [0/7] ensure traefik ---"
$COMPOSE up -d traefik

# Идемпотентно поднять Nominatim. Если volume пуст — стартует импорт PBF Tatarstan
# (~15-30min в фоне), api в это время продолжает работать через depends_on=service_started.
# Volume /opt/poputchiki/nominatim-data в норме НЕ удаляется (защита от пере-импорта).
# Recovery: если предыдущий импорт упал (restartCount>5 ИЛИ контейнер в restart-loop),
# wipe volume + recreate чтобы fresh-import состоялся при следующем up.
echo "--- [0.5/7] ensure nominatim + osrm ---"
NOMINATIM_CID=$(docker ps -a --filter "name=infra-nominatim-1" --format "{{.ID}}" | head -n1)
if [[ -n "$NOMINATIM_CID" ]]; then
  RC=$(docker inspect -f '{{.RestartCount}}' "$NOMINATIM_CID" 2>/dev/null || echo 0)
  HEALTH=$(docker inspect -f '{{.State.Health.Status}}' "$NOMINATIM_CID" 2>/dev/null || echo "")
  if [[ "$RC" -gt 5 && "$HEALTH" != "healthy" ]]; then
    echo "Nominatim restart-loop detected (RC=$RC, health=$HEALTH). Wiping nominatim-data."
    $COMPOSE rm -sf nominatim || true
    rm -rf /opt/poputchiki/nominatim-data
    mkdir -p /opt/poputchiki/nominatim-data
  fi
fi
$COMPOSE up -d nominatim
# OSRM: osrm-init идемпотентен (skip если данные есть), osrm зависит от osrm-init.
# При первом запуске скачивание PBF + подготовка ~5-10min.
$COMPOSE up -d osrm

# Шаг 1: pre-deploy backup
# CICD-03: между двумя daily-backup'ами (cron: 01:00 UTC = 04:00 MSK) может пройти
# ~24h транзакций. Migration rollback не восстанавливает данные — только схему.
# Pre-deploy backup даёт точку восстановления непосредственно перед миграцией.
echo "--- [1/7] pre-deploy backup ---"
if ! bash "$STATE_DIR/scripts/backup-db.sh"; then
  echo "ERROR: pre-deploy backup failed — aborting deploy" >&2
  bash "$STATE_DIR/scripts/notify-admin.sh" "deploy ${SHA:0:8} ABORTED: backup failed" || true
  exit 1
fi

# Шаг 2: pull images
# CICD-02: после 3 неудачных pull скрипт ранее продолжал выполнение с устаревшими
# образами → silent partial deploy. Теперь: явный exit 1 + notify-admin.
echo "--- [2/7] docker pull ---"
pulled=false
for i in 1 2 3; do
  if IMAGE_TAG="$SHA" $COMPOSE pull; then
    pulled=true
    break
  fi
  echo "Pull attempt $i failed, retrying in 30s..."
  sleep 30
done
if [[ "$pulled" != "true" ]]; then
  echo "ERROR: docker pull failed after 3 attempts — aborting deploy" >&2
  bash "$STATE_DIR/scripts/notify-admin.sh" "deploy ${SHA:0:8} ABORTED: pull failed" || true
  exit 1
fi

# Шаг 3: migrate (одноразовый контейнер с superuser-подключением)
echo "--- [3/7] migrate ---"
# Сначала убедиться что postgres healthy (docker compose run не ждёт depends_on healthy)
$COMPOSE up -d --wait postgres
IMAGE_TAG="$SHA" $COMPOSE --profile migrations run --rm migrations

# Шаг 4: rolling restart сервисов (postgres не трогаем)
echo "--- [4/7] up services ---"
PREVIOUS_TAG=$(cat "$TAGS_DIR/current-tag" 2>/dev/null || echo "")
# pgbouncer должен подняться раньше api (api держит DATABASE_URL на pgbouncer:6432).
IMAGE_TAG="$SHA" $COMPOSE up -d --no-deps pgbouncer
IMAGE_TAG="$SHA" $COMPOSE up -d --no-deps api notifier cron webhook web

# Шаг 5: ждать healthcheck (per-service таймауты)
# H1: единый 120s-дедлайн для всех сервисов создавал ложный rollback —
# если api занял 110s, notifier получал <10s. Теперь каждый сервис имеет свой таймаут.
echo "--- [5/7] healthcheck (per-service timeouts) ---"
SERVICES=(pgbouncer osrm api notifier cron webhook web)
declare -A SVC_TIMEOUT=([pgbouncer]=30 [osrm]=300 [api]=90 [webhook]=90 [web]=60 [notifier]=150 [cron]=150)
for SVC in "${SERVICES[@]}"; do
  TIMEOUT="${SVC_TIMEOUT[$SVC]}"
  DEADLINE=$((SECONDS + TIMEOUT))
  echo "Waiting for $SVC (max ${TIMEOUT}s)..."
  while true; do
    STATUS=$(IMAGE_TAG="$SHA" $COMPOSE ps --format json "$SVC" 2>/dev/null \
      | grep -oE '"Health":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [[ "$STATUS" == "healthy" ]]; then
      echo "$SVC healthy"
      break
    fi
    if [[ $SECONDS -ge $DEADLINE ]]; then
      echo "ERROR: $SVC not healthy after ${TIMEOUT}s" >&2
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
    | awk -v keep="$KEEP_TAG" -v cur="$SHA" '$2 != keep && $2 != cur && $2 != "latest"' \
    | head -n -5 \
    | awk '{print $1}' \
    | xargs --no-run-if-empty docker rmi -f 2>/dev/null || true
done
# Удалить только dangling образы без тега (безопасно — не трогает чужие контейнеры)
docker image prune -f --filter "dangling=true" 2>/dev/null || true

echo "=== deploy $SHA SUCCESS ==="
bash "$STATE_DIR/scripts/notify-admin.sh" "deploy ${SHA:0:8} success" || true
