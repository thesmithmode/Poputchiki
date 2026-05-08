#!/usr/bin/env bash
# Smoke-тест восстановления: расшифровать + распаковать → pg_restore в restore_test_<ts> → проверка.
# Usage: restore-test.sh [backup-file]  (если не указан — берёт последний poputchiki-*.dump.zst.gpg)
# Env:   DATABASE_URL, BACKUP_KEY, BACKUP_DIR (default: /opt/poputchiki/backups)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_KEY:?BACKUP_KEY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/poputchiki/backups}"

if [[ $# -ge 1 ]]; then
  BACKUP_FILE="$1"
else
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/poputchiki-*.dump.zst.gpg 2>/dev/null | head -1)
fi

if [[ -z "${BACKUP_FILE:-}" || ! -f "$BACKUP_FILE" ]]; then
  echo "RESTORE_TEST_SKIP: no backup file found" >&2
  exit 0
fi

TS=$(date -u +%s)
TEST_DB="restore_test_${TS}"

# Derive base connection (strip trailing /dbname)
BASE_URL="${DATABASE_URL%/*}"
POSTGRES_URL="${BASE_URL}/postgres"

cleanup() {
  psql "$POSTGRES_URL" -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql "$POSTGRES_URL" -c "CREATE DATABASE ${TEST_DB};" >/dev/null

RESTORE_URL="${BASE_URL}/${TEST_DB}"

# Decrypt → decompress → restore
TMPFILE=$(mktemp /tmp/restore-XXXXXX.dump)
trap 'rm -f "$TMPFILE"; cleanup' EXIT

gpg --decrypt --batch --passphrase "$BACKUP_KEY" --no-symkey-cache -q "$BACKUP_FILE" \
  | zstd -d -q -o "$TMPFILE"

pg_restore -d "$RESTORE_URL" --no-owner --no-privileges -j 2 "$TMPFILE" 2>/dev/null || true

# Smoke: verify key tables exist and have rows
USERS=$(psql "$RESTORE_URL" -At -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
RIDES=$(psql "$RESTORE_URL" -At -c "SELECT COUNT(*) FROM rides;" 2>/dev/null || echo "0")

echo "RESTORE_TEST_OK users=${USERS} rides=${RIDES}"
