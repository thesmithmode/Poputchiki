# postgres-js gotchas

Все интеграционные тесты гоняют запросы через `postgres` (postgres-js). Часть
ошибок прячется в синтаксисе tagged-template — собрали в одном месте, чтобы не
ловить `42P18` или `42883` на проде.

## 1. LIKE с параметром: pattern строй в JS

`postgres-js` подставляет `${x}` как `$1` параметр **только** на уровне
top-level expression. Внутри одинарной кавычки SQL-литерала это уже строка,
Postgres видит `'ip:$1%'` и не может вывести тип → `PostgresError 42P18: could
not determine data type of parameter $1`.

Плохо:

```ts
await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'ip:${ip}%'`;
```

Хорошо:

```ts
const ipPattern = `ip:${ip}%`;
await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${ipPattern}`;
```

## 2. IMMUTABLE wrapper для btree expression index

`date_trunc(text, timestamptz)` — STABLE (зависит от session TZ), btree индексы
требуют IMMUTABLE. Заворачивай в свою функцию через `AT TIME ZONE 'UTC'`:

```sql
CREATE FUNCTION complaint_week_utc(ts timestamptz) RETURNS timestamp AS $$
  SELECT date_trunc('week', (ts AT TIME ZONE 'UTC'));
$$ LANGUAGE sql IMMUTABLE;

CREATE UNIQUE INDEX ... ON complaints (..., complaint_week_utc(created_at));
```

См. `db/migrations/009_complaints_antispam_idx.sql`.

## 3. Не интерполируй JS template literal внутри tagged template

`` `'ip:${ip}%'` `` внутри `` sql`...` `` — это **не** строковая интерполяция
JS, а синтаксис tagged template. `${ip}` всё равно станет параметром — но
вокруг кавычки выключают его. Всегда строй полную строку до tagged template.

## 4. `sql.unsafe(...)` — для DDL и `pg_terminate_backend`

DDL без параметров (`CREATE DATABASE foo`) использовать через `sql.unsafe(...)`.
Параметризации в DDL нет, имена БД/ролей валидируй вручную.

## 5. `prepare: false` для миграций

Миграции выполняются один раз — prepared statements не нужны и иногда мешают
(`CREATE TYPE` в одной транзакции с использованием). Создавай pool с
`{ prepare: false }` для миграционных раннеров.
