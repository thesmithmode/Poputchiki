#!/usr/bin/env bash
# Резервное копирование БД: pg_dump | zstd | gpg.
# Usage: backup-db.sh [--base]
# Env:   DATABASE_URL, BACKUP_KEY, BACKUP_DIR (default: /opt/poputchiki/backups)
set -euo pipefail

BASE_MODE=0
for arg in "$@"; do
  [[ "$arg" == "--base" ]] && BASE_MODE=1
done

: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_KEY:?BACKUP_KEY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/poputchiki/backups}"
mkdir -p "$BACKUP_DIR"

DATE=$(date -u +%Y-%m-%d)
WEEK=$(date -u +%Y-%V)

if [[ $BASE_MODE -eq 1 ]]; then
  OUT="$BACKUP_DIR/base-${WEEK}.tar.zst.gpg"
  TMPFILE=$(mktemp /tmp/pgbase-XXXXXX.tar)
  trap 'rm -f "$TMPFILE"' EXIT
  pg_basebackup -d "$DATABASE_URL" -F tar -z -D - 2>/dev/null \
    | zstd -19 -q \
    | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -o "$OUT"
  echo "BASE_BACKUP_OK $OUT"
else
  OUT="$BACKUP_DIR/poputchiki-${DATE}.dump.zst.gpg"
  pg_dump "$DATABASE_URL" --format=custom --jobs=1 --no-password \
    | zstd -19 -q \
    | gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -o "$OUT"
  echo "BACKUP_OK $OUT"
fi

# Retention: daily 30, weekly 12, monthly 24
find "$BACKUP_DIR" -name "poputchiki-*.dump.zst.gpg" -mtime +30 -delete
find "$BACKUP_DIR" -name "base-*.tar.zst.gpg" -mtime +$((12 * 7)) -delete
find "$BACKUP_DIR" -name "poputchiki-*-01.dump.zst.gpg" -mtime +$((24 * 30)) -delete 2>/dev/null || true
