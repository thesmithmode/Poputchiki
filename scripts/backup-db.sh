#!/usr/bin/env bash
# Резервное копирование БД: pg_dump | zstd | gpg.
# Usage: backup-db.sh
# Env:   DATABASE_URL, BACKUP_KEY, BACKUP_DIR (default: /opt/poputchiki/backups)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_KEY:?BACKUP_KEY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/poputchiki/backups}"
mkdir -p "$BACKUP_DIR"

DATE=$(date -u +%Y-%m-%d_%H%M)
OUT="$BACKUP_DIR/poputchiki-${DATE}.dump.zst.gpg"

pg_dump "$DATABASE_URL" --format=custom --no-password \
  | zstd -19 -q \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -o "$OUT"

echo "BACKUP_OK $OUT"

# Retention: хранить только 3 последних файла
ls -t "$BACKUP_DIR"/poputchiki-*.dump.zst.gpg 2>/dev/null \
  | tail -n +4 \
  | xargs --no-run-if-empty rm -f
