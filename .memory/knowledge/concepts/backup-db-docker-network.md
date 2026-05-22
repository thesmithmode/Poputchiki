---
title: "pg_dump внутри Docker-сети — hostname и detection-based backup"
aliases: [backup-db-docker, pg-dump-hostname, backup-sh-docker-exec]
tags: [postgresql, docker, devops, backup, gotcha]
sources:
  - "daily/2026-05-21.md"
created: 2026-05-21
updated: 2026-05-21
---

# pg_dump внутри Docker-сети — hostname и detection-based backup

`pg_dump` с hostname `postgres` работает только внутри Docker-сети. С хоста `postgres` не резолвится — нужен `docker exec postgres pg_dump ...` или `localhost:5432` при пробросе порта. Правильный `backup-db.sh` определяет контекст выполнения и выбирает стратегию: изнутри контейнера (cron-сервис) → прямой `pg_dump`; с хоста → `docker exec`.

## Key Points

- `pg_dump -h postgres` → `could not translate host name "postgres"` с хостовой машины
- Hostname `postgres` существует только внутри Docker overlay/bridge сети
- Установка `pg_dump` на хосте + routing через hostname — избыточное усложнение, которое ломается
- Detection: `[ -f /.dockerenv ]` определяет, запущен ли скрипт внутри контейнера
- Cron-сервис (`apps/cron`) запускается в Docker → может использовать `pg_dump -h postgres` напрямую
- С хоста (CI, локальный запуск) → `docker exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB`

## Details

Типичная ошибка в `scripts/backup-db.sh`:

```bash
# WRONG: fails from host machine
pg_dump -h postgres -U $POSTGRES_USER $POSTGRES_DB | gzip > backup.sql.gz
```

Два корректных подхода:

**1. Прямой вызов (только изнутри Docker-сети):**
```bash
# Works in cron container, CI postgres service, or docker compose run
PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
  -h postgres -U $POSTGRES_USER $POSTGRES_DB | gzip > backup.sql.gz
```

**2. docker exec (с хоста):**
```bash
# Works from host machine; requires postgres container running
docker exec -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
  pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > backup.sql.gz
```

**Detection-based backup-db.sh:**
```bash
#!/usr/bin/env bash
set -euo pipefail

if [ -f /.dockerenv ]; then
  # Inside Docker (cron container) — use hostname routing
  PGPASSWORD=$POSTGRES_PASSWORD pg_dump \
    -h postgres -p 5432 -U $POSTGRES_USER $POSTGRES_DB \
    | gzip > /backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz
else
  # Host machine — use docker exec
  docker exec -e PGPASSWORD=$POSTGRES_PASSWORD postgres \
    pg_dump -U $POSTGRES_USER $POSTGRES_DB \
    | gzip > ./backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz
fi
```

**Почему `localhost:5432` ненадёжен:** Даже если порт пробрасывается (`ports: - "5432:5432"`), в CI среде или при нескольких postgres-контейнерах на хосте это создаёт конфликты. `docker exec` однозначно адресует нужный контейнер.

**Связь с GHA deploy:** В `scripts/deploy.sh` pre-deploy backup должен использовать `docker exec postgres pg_dump ...` — deploy.sh выполняется через SSH на хосте, не внутри контейнера. Если backup-db.sh автоматически определяет контекст, deploy.sh может просто вызывать его без дополнительных флагов.

## Related Concepts

- [[concepts/deployment-pipeline]] — deploy.sh включает pre-deploy backup как первый шаг
- [[concepts/postgres-volume-init-idempotency]] — Смежные тонкости Docker + Postgres: имена баз, init-скрипты, тома
- [[concepts/self-hosted-postgres]] — Self-hosted Postgres 16 в Docker — контекст всей инфраструктуры

## Sources

- [[daily/2026-05-21.md]] — backup-db.sh ломался: pg_dump с hostname `postgres` недоступен с хоста; установка pg_dump на хост + hostname routing = overcomplication; fix: detection-based script с docker exec для хоста и прямым pg_dump для контейнера
