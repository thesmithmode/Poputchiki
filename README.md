# Poputchiki

Telegram Mini App для совместных поездок.

Пользователь открывает бот в Telegram → видит карту с попутчиками → создаёт поездку или присоединяется к чужой → договаривается прямо в интерфейсе. Никаких внешних аккаунтов — авторизация через Telegram Identity.

## Что умеет

- Создание поездок с маршрутом, временем, количеством мест
- Карта активных поездок (Leaflet + OpenStreetMap)
- Запросы на участие, подтверждение водителем
- Пресеты фильтров (сохранённые комбинации маршрут+цена+время), повторяющиеся шаблоны поездок
- Лайки, отзывы, жалобы на пользователей
- Push-уведомления через Telegram Bot API
- Геокодинг адресов (self-hosted Nominatim, регион Татарстан)
- Realtime-обновления через SSE

## Из чего состоит

```
apps/
  api          — HTTP API (Hono + Bun, порт 3000)
  web-server   — отдаёт собранный React SPA
  notifier     — слушает Postgres NOTIFY, шлёт TG-уведомления
  cron         — периодические задачи (бэкапы, шаблоны, аудит)
  webhook      — принимает апдейты от Telegram Bot API

web/           — React SPA (Vite), отображается внутри Telegram
packages/
  shared       — Zod-схемы и TypeScript-типы, общие для api и web

infra/         — Docker Compose (dev/prod/observability), Postgres конфиг
db/            — SQL-миграции
scripts/       — deploy, rollback, backup, preflight
.github/       — CI (lint/test/coverage) + deploy workflow
```

## Стек

| Слой | Технологии |
|------|-----------|
| Backend | TypeScript, Hono, Bun |
| Frontend | TypeScript, React 18, Vite, Leaflet |
| База данных | PostgreSQL 16 (self-hosted Docker) |
| Auth | HMAC-валидация Telegram initData → JWT HS256 |
| Realtime | SSE + Postgres LISTEN/NOTIFY |
| Геокодинг | self-hosted Nominatim (Татарстан OSM) |
| Деплой | GitHub Actions → GHCR → SSH → Docker Compose |

## Целевая нагрузка

50 000 одновременных пользователей. Все архитектурные решения (пул соединений, RLS, connection limits) принимались с учётом этого.

## Документация

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — модули, зависимости, взаимодействие
- [`docs/modules/`](docs/modules/) — технические доки по каждому сервису
- [`docs/SPEC-Architecture-v0.1.md`](docs/SPEC-Architecture-v0.1.md) — полная архитектурная спецификация
- [`docs/PRD-Poputchiki-v0.1.md`](docs/PRD-Poputchiki-v0.1.md) — продуктовые требования
- [`docs/PRE-LAUNCH-CHECKLIST.md`](docs/PRE-LAUNCH-CHECKLIST.md) — чеклист перед запуском
- [`docs/runbook/`](docs/runbook/) — операционные runbook-ы
