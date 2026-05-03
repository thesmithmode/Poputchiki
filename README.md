# Poputchiki

Telegram MiniApp для попутчиков ЖК Царёво.

## Стек

- **Backend**: TypeScript + Hono + Bun (`apps/api`)
- **Frontend**: TypeScript + Vite + React SPA (`web/`)
- **БД**: self-hosted PostgreSQL 16 в Docker
- **Auth**: собственный JWT (HS256) после HMAC-проверки Telegram initData
- **Realtime**: SSE + Postgres LISTEN/NOTIFY
- **Карта**: Leaflet + OpenStreetMap + self-hosted Nominatim

## Быстрый старт (локально)

```bash
cp .env.example .env   # заполни переменные
bun install
bun run db:up:dev      # поднять dev postgres + nominatim
bun run db:migrate     # накатить миграции
bun run dev            # запустить API (apps/api) + Web (web/)
```

## Unit-тесты

```bash
bun run test:unit      # запуск unit-тестов (без БД)
bun run coverage:check # unit + coverage report (95%+ gate)
```

Unit-тесты живут в `apps/*/tests/unit/**`. Не требуют запущенной БД.

## Integration tests

Integration-тесты требуют запущенный Postgres с применёнными миграциями.

### Локальный запуск

```bash
# 1. Поднять dev-postgres (если ещё не запущен)
docker compose -f infra/docker-compose.dev.yml up -d postgres

# 2. Применить миграции
bun run db:migrate

# 3. Запустить integration-тесты
bun run test:integration
```

По умолчанию тесты подключаются к БД через `DATABASE_URL` (или `POSTGRES_*` env-переменные). Для отдельной тестовой БД задай `DATABASE_URL_TEST`.

### Вспомогательные хелперы (TASK-129)

`apps/api/tests/integration/setup.ts` предоставляет:

- `buildDsn()` — собирает DSN из `DATABASE_URL_TEST` / `DATABASE_URL` / `POSTGRES_*`
- `withTestUser(sql, tgId, role?)` — вставляет тестового пользователя, возвращает `{ id, tgId, role, cleanup() }`
- `truncateAll(sql)` — очищает все таблицы (TRUNCATE CASCADE) для полного сброса состояния

Пример использования:

```typescript
import { createPool } from "../../src/db/pool";
import { buildDsn, withTestUser } from "./setup";

let sql: ReturnType<typeof createPool>;

beforeAll(async () => { sql = createPool(buildDsn()); });
afterAll(async () => { await sql.end(); });

it("user sees own record", async () => {
  const user = await withTestUser(sql, 12345);
  try {
    // ... test via withIdentity(sql, user, ...) ...
  } finally {
    await user.cleanup();
  }
});
```

### CI

Integration-тесты автоматически запускаются в GHA (`ci.yml`) на каждый push в `dev`/`main`. CI поднимает postgres сервис, накатывает миграции и выполняет `bun run test:integration`.

## Деплой

```bash
# Production деплой (только через GHA или вручную)
./scripts/deploy.sh <SHA>
# Rollback
./scripts/rollback.sh
```
