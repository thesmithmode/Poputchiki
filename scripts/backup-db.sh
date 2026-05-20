#!/usr/bin/env bash
# Резервное копирование БД: pg_dump | zstd | gpg.
# Usage: backup-db.sh
# Env (host mode):   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB,
#                    BACKUP_KEY, BACKUP_DIR, POSTGRES_CONTAINER (default: infra-postgres-1)
# Env (cron mode):   DATABASE_URL, BACKUP_KEY, BACKUP_DIR
# Detection: если доступен docker и есть запущенный postgres-контейнер —
# pg_dump выполняется внутри него (host hostname `postgres` нет в /etc/hosts).
# Иначе — pg_dump напрямую (cron container внутри docker-сети).
set -euo pipefail

: "${BACKUP_KEY:?BACKUP_KEY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/poputchiki/backups}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-infra-postgres-1}"
mkdir -p "$BACKUP_DIR"

DATE=$(date -u +%Y-%m-%d_%H%M)
OUT="$BACKUP_DIR/poputchiki-${DATE}.dump.zst.gpg"

if command -v docker &>/dev/null && docker ps --filter "name=^${POSTGRES_CONTAINER}$" --filter "status=running" -q 2>/dev/null | grep -q .; then
  : "${POSTGRES_USER:?POSTGRES_USER required in host mode}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required in host mode}"
  : "${POSTGRES_DB:?POSTGRES_DB required in host mode}"
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
    pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-password \
    | zstd -19 -q \
    | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -o "$OUT"
else
  : "${DATABASE_URL:?DATABASE_URL required in cron mode}"
  pg_dump "$DATABASE_URL" --format=custom --no-password \
    | zstd -19 -q \
    | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -o "$OUT"
fi

echo "BACKUP_OK $OUT"

# CICD-03: retention 14 daily backups (было 3 — недостаточно для RPO/RTO).
# Pre-deploy backup может встретиться с cron backup в одном дне — буфер нужен.
BACKUP_KEEP="${BACKUP_KEEP:-14}"
ls -t "$BACKUP_DIR"/poputchiki-*.dump.zst.gpg 2>/dev/null \
  | tail -n +$((BACKUP_KEEP + 1)) \
  | xargs --no-run-if-empty rm -f
