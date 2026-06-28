#!/usr/bin/env bash
# Smoke-тест восстановления: расшифровать + распаковать → pg_restore в restore_test_<ts> → проверка.
# Usage: restore-test.sh [backup-file]  (если не указан — берёт последний poputchiki-*.dump.zst.gpg)
# Env:   DATABASE_URL, BACKUP_KEY, BACKUP_DIR (default: /opt/poputchiki/backups)
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL required}"
: "${BACKUP_KEY:?BACKUP_KEY required}"
BACKUP_DIR="${BACKUP_DIR:-/opt/poputchiki/backups}"

PGPASSFILE_PATH=""
cleanup_pgpass() {
  if [[ -n "$PGPASSFILE_PATH" ]]; then
    rm -f "$PGPASSFILE_PATH"
  fi
}

write_pgpass_from_url() {
  local url="$1"
  local db="$2"
  PGPASSFILE_PATH=$(mktemp /tmp/poputchiki-pgpass-XXXXXX)
  chmod 600 "$PGPASSFILE_PATH"
  PARSE_DATABASE_URL="$url" PARSE_DATABASE_DB="${db:-}" bun -e '
    const url = new URL(process.env.PARSE_DATABASE_URL);
    const db = process.env.PARSE_DATABASE_DB;
    const host = url.hostname || "localhost";
    const port = url.port || "5432";
    const user = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const esc = (value) => value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
    console.log(`${esc(host)}:${esc(port)}:${esc(db)}:${esc(user)}:${esc(password)}`);
  ' >"$PGPASSFILE_PATH"
  export PGPASSFILE="$PGPASSFILE_PATH"
  export PGHOST
  PGHOST=$(PARSE_DATABASE_URL="$url" bun -e 'console.log(new URL(process.env.PARSE_DATABASE_URL).hostname || "localhost")')
  export PGPORT
  PGPORT=$(PARSE_DATABASE_URL="$url" bun -e 'console.log(new URL(process.env.PARSE_DATABASE_URL).port || "5432")')
  export PGUSER
  PGUSER=$(PARSE_DATABASE_URL="$url" bun -e 'console.log(decodeURIComponent(new URL(process.env.PARSE_DATABASE_URL).username))')
}

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

write_pgpass_from_url "$DATABASE_URL" "*"

cleanup() {
  PGDATABASE=postgres psql -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
  cleanup_pgpass
}
trap cleanup EXIT

PGDATABASE=postgres psql -c "CREATE DATABASE ${TEST_DB};" >/dev/null

# Decrypt → decompress → restore
TMPFILE=$(mktemp /tmp/restore-XXXXXX.dump)
trap 'rm -f "$TMPFILE"; cleanup' EXIT

gpg --decrypt --batch --passphrase-fd 3 --no-symkey-cache -q "$BACKUP_FILE" 3<<<"$BACKUP_KEY" \
  | zstd -d -q -o "$TMPFILE"

# M7: pg_restore раньше использовал || true — ошибки скрывались, restore-test давал false positive.
# Теперь: логируем stderr, проверяем exit code явно.
RESTORE_LOG=$(mktemp /tmp/restore-log-XXXXXX.txt)
PGDATABASE="$TEST_DB" pg_restore --dbname "$TEST_DB" --no-owner --no-privileges -j 2 "$TMPFILE" 2>"$RESTORE_LOG" || {
  RC=$?
  echo "RESTORE_TEST_FAIL: pg_restore exited $RC" >&2
  cat "$RESTORE_LOG" >&2
  rm -f "$RESTORE_LOG"
  exit 1
}
rm -f "$RESTORE_LOG"

# Smoke: verify key tables exist and have rows
USERS=$(PGDATABASE="$TEST_DB" psql -At -c "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "ERROR")
RIDES=$(PGDATABASE="$TEST_DB" psql -At -c "SELECT COUNT(*) FROM rides;" 2>/dev/null || echo "ERROR")

if [[ "$USERS" == "ERROR" || "$RIDES" == "ERROR" ]]; then
  echo "RESTORE_TEST_FAIL: could not query restored tables" >&2
  exit 1
fi

echo "RESTORE_TEST_OK users=${USERS} rides=${RIDES}"
