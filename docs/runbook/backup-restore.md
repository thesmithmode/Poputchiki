# Backup & Restore

## Ручной бэкап

```bash
docker exec poputchiki-cron-1 bash scripts/backup-db.sh
```

Скрипт: `pg_dump | zstd | gpg encrypt` → `/opt/poputchiki/backups/`
Формат файла: `poputchiki_YYYYMMDD_HHMMSS.dump.zst.gpg`

## Список бэкапов

```bash
ls -lh /opt/poputchiki/backups/
```

## Политика хранения

- Ежедневные: 30 дней
- Еженедельные: 12 недель
- Ежемесячные: 24 месяца

## Восстановление из бэкапа

### 1. Расшифровать

```bash
gpg --decrypt --output dump.zst poputchiki_YYYYMMDD_HHMMSS.dump.zst.gpg
```

Ключ хранится в `/opt/poputchiki/.gpg-passphrase` (только root).

### 2. Распаковать

```bash
zstd -d dump.zst -o dump.sql
```

### 3. Остановить API (чтобы не было новых записей)

```bash
docker compose -f /opt/poputchiki/infra/docker-compose.prod.yml stop api notifier cron webhook
```

### 4. Восстановить БД

```bash
docker exec -i poputchiki-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS poputchiki; CREATE DATABASE poputchiki;"
docker exec -i poputchiki-postgres-1 psql -U postgres -d poputchiki < dump.sql
```

### 5. Запустить сервисы

```bash
docker compose -f /opt/poputchiki/infra/docker-compose.prod.yml up -d
```

### 6. Проверить

```bash
curl -sf https://api.poputchiki.searchingforgamesforever.online/health
```

## Тест восстановления (без prod)

```bash
docker exec poputchiki-cron-1 bash scripts/restore-test.sh
```

Скрипт восстанавливает последний бэкап во временную БД и проверяет базовые таблицы.
Запускать раз в неделю вручную или через cron.
