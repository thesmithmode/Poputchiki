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

PGPASSFILE_PATH=""
cleanup_pgpass() {
  if [[ -n "$PGPASSFILE_PATH" ]]; then
    rm -f "$PGPASSFILE_PATH"
  fi
}
trap cleanup_pgpass EXIT

write_pgpass_from_url() {
  local url="$1"
  PGPASSFILE_PATH=$(mktemp /tmp/poputchiki-pgpass-XXXXXX)
  chmod 600 "$PGPASSFILE_PATH"
  PARSE_DATABASE_URL="$url" PARSE_DATABASE_DB="${db:-}" bun -e '
    const url = new URL(process.env.PARSE_DATABASE_URL);
    const host = url.hostname || "localhost";
    const port = url.port || "5432";
    const db = decodeURIComponent(url.pathname.replace(/^\//, ""));
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
  export PGDATABASE
  PGDATABASE=$(PARSE_DATABASE_URL="$url" bun -e 'console.log(decodeURIComponent(new URL(process.env.PARSE_DATABASE_URL).pathname.replace(/^\//, "")))')
}

encrypt_backup() {
  gpg --symmetric --cipher-algo AES256 --batch --passphrase-fd 3 --no-symkey-cache -o "$OUT" 3<<<"$BACKUP_KEY"
}

DATE=$(date -u +%Y-%m-%d_%H%M)
OUT="$BACKUP_DIR/poputchiki-${DATE}.dump.zst.gpg"

if command -v docker &>/dev/null && docker ps --filter "name=^${POSTGRES_CONTAINER}$" --filter "status=running" -q 2>/dev/null | grep -q .; then
  : "${POSTGRES_USER:?POSTGRES_USER required in host mode}"
  : "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required in host mode}"
  : "${POSTGRES_DB:?POSTGRES_DB required in host mode}"
  printf 'localhost:5432:%s:%s:%s\n' "$POSTGRES_DB" "$POSTGRES_USER" "$POSTGRES_PASSWORD" \
    | docker exec -i -e POSTGRES_USER="$POSTGRES_USER" -e POSTGRES_DB="$POSTGRES_DB" "$POSTGRES_CONTAINER" sh -c 'umask 077; pgpass=$(mktemp /tmp/pgpass-XXXXXX); cat > "$pgpass"; PGPASSFILE="$pgpass" pg_dump -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-password; rc=$?; rm -f "$pgpass"; exit "$rc"' \
    | zstd -19 -q \
    | encrypt_backup
else
  : "${DATABASE_URL:?DATABASE_URL required in cron mode}"
  write_pgpass_from_url "$DATABASE_URL"
  pg_dump --dbname "$PGDATABASE" --format=custom --no-password \
    | zstd -19 -q \
    | encrypt_backup
fi

echo "BACKUP_OK $OUT"

# CICD-03: retention 14 daily backups (было 3 — недостаточно для RPO/RTO).
# Pre-deploy backup может встретиться с cron backup в одном дне — буфер нужен.
BACKUP_KEEP="${BACKUP_KEEP:-14}"
ls -t "$BACKUP_DIR"/poputchiki-*.dump.zst.gpg 2>/dev/null \
  | tail -n +$((BACKUP_KEEP + 1)) \
  | xargs --no-run-if-empty rm -f
