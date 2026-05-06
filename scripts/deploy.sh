#!/usr/bin/env bash
# Атомарний деплой: backup → pull → migrate → up → healthcheck → tag
# Usage: deploy.sh <SHA>
# Env:   DATABASE_URL, BACKUP_KEY, BACKUP_DIR, DOMAIN, POSTGRES_USER/PASSWORD/DB, + all app envs
set -euo pipefail

[[ $# -lt 1 ]] && { echo "Usage: $0 <SHA>" >&2; exit 1; }
SHA="$1"
COMPOSE="docker compose -f infra/docker-compose.prod.yml"
STATE_DIR="/opt/poputchiki"
TAGS_DIR="$STATE_DIR"

mkdir -p "$STATE_DIR"

echo "=== deploy $SHA ==="

# Шаг 1: pre-deploy backup
echo "--- [1/7] pre-deploy backup ---"
export IMAGE_TAG="$SHA"
BACKUP_DIR="${BACKUP_DIR:-$STATE_DIR/backups}"
BACKUP_KEY="${BACKUP_KEY:?BACKUP_KEY required}"
bash scripts/backup-db.sh
# Tag the backup with SHA for easy identification
LATEST=$(ls -t "$BACKUP_DIR"/poputchiki-*.dump.zst.gpg 2>/dev/null | head -1 || true)
if [[ -n "$LATEST" ]]; then
  TAGGED="${LATEST%.dump.zst.gpg}-pre-${SHA}.dump.zst.gpg"
  cp "$LATEST" "$TAGGED" 2>/dev/null || true
fi

# Шаг 2: pull images
echo "--- [2/7] docker pull ---"
IMAGE_TAG="$SHA" $COMPOSE pull

# Шаг 3: migrate (одноразовый контейнер)
echo "--- [3/7] migrate ---"
IMAGE_TAG="$SHA" $COMPOSE run --rm api bun run db:migrate up

# Шаг 4: rolling restart сервисов (postgres не трогаем)
echo "--- [4/7] up services ---"
PREVIOUS_TAG=$(cat "$TAGS_DIR/current-tag" 2>/dev/null || echo "latest")
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
      # Rollback: restore previous tag
      bash scripts/rollback.sh "$PREVIOUS_TAG" || true
      exit 1
    fi
    sleep 3
  done
done

# Шаг 6: обновить теги
echo "--- [6/7] update tags ---"
echo "$PREVIOUS_TAG" > "$TAGS_DIR/last-good-tag"
echo "$SHA" > "$TAGS_DIR/current-tag"

# Шаг 7: cleanup старых образов (keep 5)
echo "--- [7/7] cleanup images ---"
for IMAGE in poputchiki-api poputchiki-notifier poputchiki-cron poputchiki-webhook poputchiki-web; do
  docker images "ghcr.io/thesmithmode/${IMAGE}" --format "{{.ID}} {{.Tag}}" \
    | sort -k2 \
    | head -n -5 \
    | awk '{print $1}' \
    | xargs --no-run-if-empty docker rmi -f 2>/dev/null || true
done

echo "=== deploy $SHA SUCCESS ==="
bash scripts/notify-admin.sh "deploy ${SHA} success" || true
