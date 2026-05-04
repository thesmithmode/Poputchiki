#!/usr/bin/env bash
# db:reset — снос локальной БД и пересоздание с миграциями + сидами.
# Только dev/test, в production откажет.
set -euo pipefail

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "ERROR: db:reset запрещён в production" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> docker compose down -v (postgres volume drop)"
docker compose -f infra/docker-compose.dev.yml down -v

echo "==> docker compose up -d postgres"
docker compose -f infra/docker-compose.dev.yml up -d postgres

echo "==> wait for postgres healthy"
for i in {1..30}; do
  status=$(docker inspect --format='{{.State.Health.Status}}' \
    "$(docker compose -f infra/docker-compose.dev.yml ps -q postgres)" 2>/dev/null || echo "unknown")
  if [[ "$status" == "healthy" ]]; then break; fi
  sleep 2
done
if [[ "$status" != "healthy" ]]; then
  echo "ERROR: postgres не стал healthy за 60с (last=$status)" >&2
  exit 2
fi

echo "==> bun run db:migrate"
bun run db:migrate

echo "==> bun run db:seed"
bun run db:seed

echo "==> done."
