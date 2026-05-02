# Migrations

SQL-миграции управляются через `node-pg-migrate`.

## Правила

- Имена файлов: `<timestamp>_<описание>.{up,down}.sql` (генерирует `db:migrate:create`)
- Каждая миграция обратима — обязателен `down`
- Никогда не редактировать применённую миграцию — только новая миграция с исправлением
- Порядок: `000_` — identity helpers, `001_` — users, `002_` — rides, `003_` — social, `004_+` — всё остальное

## Команды

```bash
bun run db:migrate             # применить все pending
bun run db:migrate:down        # откатить последнюю
bun run db:migrate:create NAME # создать новую пустую миграцию
```
