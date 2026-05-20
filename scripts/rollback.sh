#!/usr/bin/env bash
# Rollback: переключение на предыдущий тег или указанный
# Usage: rollback.sh [tag]  (если не указан — читает /opt/poputchiki/last-good-tag)
set -euo pipefail

STATE_DIR="/opt/poputchiki"
COMPOSE="docker compose -f $STATE_DIR/infra/docker-compose.prod.yml --env-file $STATE_DIR/.env"

if [[ $# -ge 1 ]]; then
  TARGET_TAG="$1"
else
  TARGET_TAG=$(cat "$STATE_DIR/last-good-tag" 2>/dev/null || echo "")
fi

if [[ -z "${TARGET_TAG:-}" ]]; then
  echo "ERROR: no rollback tag available (first deploy?)" >&2
  bash "$STATE_DIR/scripts/notify-admin.sh" "CRITICAL: deploy failed, no rollback tag — first deploy. Bring up manually." || true
  exit 1
fi

echo "=== rollback to $TARGET_TAG ==="

# Restart services with old tag
IMAGE_TAG="$TARGET_TAG" $COMPOSE up -d --no-deps api notifier cron webhook web

# Smoke: /health
DEADLINE=$((SECONDS + 60))
while true; do
  if $COMPOSE exec -T api wget --spider -q http://localhost:3000/health >/dev/null 2>&1; then
    echo "smoke OK"
    break
  fi
  if [[ $SECONDS -ge $DEADLINE ]]; then
    echo "ERROR: rollback smoke failed" >&2
    bash "$STATE_DIR/scripts/notify-admin.sh" "CRITICAL: rollback $TARGET_TAG smoke FAILED" || true
    exit 1
  fi
  sleep 3
done

# H8: после rollback обновляем оба файла — rollback-тег сам становится "last-good".
# Иначе следующий deploy сохранит неудачный тег в last-good-tag.
echo "$TARGET_TAG" > "$STATE_DIR/current-tag"
echo "$TARGET_TAG" > "$STATE_DIR/last-good-tag"
echo "=== rollback $TARGET_TAG SUCCESS ==="
bash "$STATE_DIR/scripts/notify-admin.sh" "rollback to ${TARGET_TAG} success" || true
