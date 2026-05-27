# apps/cron

Планировщик фоновых задач. setInterval + UTC time guards. Нет внешнего cron-демона.

## Задачи

| Задача | Интервал / время | Описание |
|--------|-----------------|---------|
| runCleanup | каждые 5 мин | удаляет nonce старше TTL (anti-replay) |
| runRefreshUserStats | каждые 5 мин | пересчитывает агрегированный рейтинг users |
| runAuditLogCleanup | 1-е число 02:00 UTC | удаляет audit_log записи старше 90 дней |
| runExpandTemplates | ежедневно 03:00 UTC | создаёт поездки из шаблонов на следующий день |
| runDailyBackup | ежедневно 03:00 UTC | pg_dump → zstd → gpg → /opt/poputchiki/backups |
| runWeeklyBaseBackup | воскресенье 04:00 UTC | pg_basebackup (full physical, PITR-ready) |
| runWeeklyRestoreTest | воскресенье 05:00 UTC | авто-тест восстановления из последнего бэкапа |

Главный цикл — `setInterval` с шагом 1 час. Каждый шаг проверяет UTC-час (и день недели где нужно) перед запуском задачи.

## Advisory locks

`withLock(sql, lockId, fn)` использует `pg_try_advisory_xact_lock(lockId)`. Если лок не получен — задача пропускается. Это позволяет запускать несколько экземпляров cron без дублирования работы.

Lock ID-ы:
- 100001 — cleanup
- 100002 — user stats
- 100003 — audit log cleanup
- 100004 — expand templates
- 200001 — daily backup
- 200002 — base backup
- 200003 — restore test

## Бэкапы

Скрипты в `scripts/`:
- `backup-db.sh` — pg_dump | zstd -19 | gpg AES256. Хранится в `$BACKUP_DIR` (default: `/opt/poputchiki/backups`). Ключ: `$BACKUP_KEY`.
- `restore-test.sh` — создаёт временную БД, восстанавливает, делает smoke-проверку, удаляет.

Retention: daily 30д, weekly 84д, monthly 720д.

## Переменные окружения

`DATABASE_URL`, `BACKUP_KEY`, `BACKUP_DIR`, `POSTGRES_*`, `ADMIN_TG_CHAT_ID`, `BOT_TOKEN`, `LOG_LEVEL`
