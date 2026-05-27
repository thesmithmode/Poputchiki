# Архитектура Poputchiki

## Обзор

Монорепо (Bun workspaces). Пять независимых микросервисов + React SPA + общий пакет схем. Всё в Docker Compose, без managed-сервисов.

```
                ┌─────────────┐
  Telegram      │   Traefik   │  ← HTTPS termination, Let's Encrypt
  Mini App  ──► │  (reverse   │
                │   proxy)    │
                └──────┬──────┘
                       │
          ┌────────────┼─────────────┐
          │            │             │
     api:3000    webhook:3001   web-server:80
          │            │             │
          │    ┌───────┴───────┐     │
          │    │  Telegram     │     │
          │    │  Bot API      │     │
          │    └───────────────┘     │
          │                          │
          └──────────┬───────────────┘
                     │
              ┌──────▼──────┐
              │ PostgreSQL  │  ← единственное хранилище
              │     16      │
              └──────┬──────┘
                     │  LISTEN/NOTIFY
              ┌──────▼──────┐
              │  notifier   │ ─► Telegram Bot API (push)
              └─────────────┘
              ┌─────────────┐
              │    cron     │ ─► backup-db.sh, restore-test.sh
              └─────────────┘
```

## Модули

### `apps/api` — HTTP API

Точка входа для React SPA. Hono на Bun, порт 3000.

**Отвечает за:**
- Аутентификацию: HMAC-проверка Telegram initData → JWT access+refresh
- Все CRUD-операции: rides, users, requests, templates, favorites, likes, reviews, complaints, support
- Realtime: SSE-стрим через `GET /api/realtime` (Postgres LISTEN → SSE push)
- Геокодинг-прокси: `/api/geocode` → Nominatim
- Сбор клиентских ошибок: `POST /api/client-errors` (публичный, без auth)
- Метрики и healthcheck: `GET /health`, `GET /ready`, `GET /metrics`

**Ключевые внутренние слои:**

```
app.ts              — сборка Hono app, монтирование роутеров
middleware/         — auth, rate-limit, cors, csrf, anti-bot, идемпотентность,
                      secure-headers, audit-log, error-capture
rides/              — роутер поездок (самый сложный: create/patch/cancel/join/confirm)
auth/               — /auth/login, /auth/refresh, /auth/logout
realtime/           — SSE + LISTEN-соединение к Postgres
db/                 — пул соединений (postgres.js), withIdentity (GUC), crypto (pgcrypto)
lib/                — logger (pino + redaction), db-errors, with-retry
```

**RLS-идентификация:** каждый запрос открывает транзакцию с `SET LOCAL app.current_user_id = N` — PostgreSQL Row Level Security использует этот GUC вместо Supabase `auth.uid()`.

**Зависит от:** PostgreSQL, `packages/shared` (Zod-схемы), Nominatim

---

### `apps/notifier` — Push-уведомления

Фоновый процесс. Не имеет HTTP-интерфейса.

**Отвечает за:**
- `LISTEN notify_user` на Postgres
- При получении `NOTIFY notify_user, '{"user_id":N,"text":"..."}'` → `sendMessage` в Telegram Bot API
- Circuit breaker (5 последовательных сбоев → 30 с паузы)

**Зависит от:** PostgreSQL (1 соединение), Telegram Bot API

---

### `apps/cron` — Планировщик

Фоновый процесс, setInterval-based scheduler. Без внешнего cron-демона.

**Задачи:**

| Задача | Расписание | Что делает |
|--------|-----------|-----------|
| runCleanup | каждые 5 мин | удаляет устаревшие nonce из auth |
| runRefreshUserStats | каждые 5 мин | агрегирует рейтинги пользователей |
| runAuditLogCleanup | 1-е число, 02:00 UTC | чистит audit_log старше 90 дней |
| runExpandTemplates | ежедневно 03:00 UTC | создаёт поездки из повторяющихся шаблонов |
| runDailyBackup | ежедневно 03:00 UTC | pg_dump → zstd → gpg → /backups |
| runWeeklyBaseBackup | воскресенье 04:00 UTC | pg_basebackup (PITR) |
| runWeeklyRestoreTest | воскресенье 05:00 UTC | проверяет восстановление из бэкапа |

Все задачи обёрнуты в `withLock(sql, lockId, fn)` — `pg_try_advisory_xact_lock` защищает от дублирования при горизонтальном масштабировании.

**Зависит от:** PostgreSQL, bash-скрипты (`scripts/backup-db.sh`, `scripts/restore-test.sh`)

---

### `apps/webhook` — Telegram Webhook

HTTP-сервер, порт 3001. Принимает апдейты от Telegram.

**Отвечает за:**
- `POST /webhook/tg` — приём Telegram Update
- Валидация `X-Telegram-Bot-Api-Secret-Token`
- Дедупликация по `update_id` (LRU-кэш)
- Обработка `message` и `callback_query`
- `GET /health`

Регистрация webhook: `scripts/setup-webhook.sh` (один раз при деплое).

**Зависит от:** PostgreSQL (для персистентного состояния при необходимости), Telegram Bot API

---

### `apps/web-server` — Статика

Caddy или Bun static server. Отдаёт собранный `web/dist/`.

---

### `web/` — React SPA

Telegram Mini App. Работает внутри WebView Telegram.

**Структура:**

```
screens/        — 14 экранов (Map, Feed, Profile, Ride, Onboarding, Admin...)
components/     — RideCard, Avatar, FiltersPanel, ComplaintSheet, ErrorBoundary
hooks/          — useRides, useUser, useRealtime, useTelegramBack/Haptic...
lib/
  api.ts        — fetch-клиент (JWT из cookie, retry, error handling)
  telegram.ts   — Telegram WebApp SDK обёртка
  error-reporter.ts — отправка ошибок на /api/client-errors
i18n/ru.json    — все строки интерфейса
```

**Auth flow:** `Telegram.WebApp.initData` → `POST /api/auth/login` → JWT в httpOnly cookie → все запросы идут с cookie.

**Realtime:** `useRealtime` подключается к `GET /api/realtime` (SSE), обновляет локальный стейт при событиях.

**Зависит от:** `apps/api`, `packages/shared` (типы)

---

### `packages/shared` — Общие схемы

Zod-схемы для валидации на API и типизации на фронте. Единственный источник истины для контрактов между сервисами.

**Экспортирует:** `UserDTO`, `RideDTO`, `RideStatus`, `CreateRideInput`, `ReviewDTO`, `LikeDTO`, `ComplaintInput`, `SupportMessageInput` + соответствующие TypeScript-типы.

---

## Карта зависимостей

```
web           → packages/shared (типы)
              → apps/api (HTTP)

apps/api      → packages/shared (валидация)
              → PostgreSQL
              → Nominatim (geocode)

apps/notifier → PostgreSQL (LISTEN)
              → Telegram Bot API

apps/cron     → PostgreSQL
              → scripts/backup-db.sh
              → scripts/restore-test.sh

apps/webhook  → PostgreSQL
              → Telegram Bot API

apps/web-server → web/dist (статика)
```

---

## База данных

PostgreSQL 16 (Docker). RLS включён на всех пользовательских таблицах.

**Ключевые таблицы:**

| Таблица | Назначение |
|---------|-----------|
| users | профили, роли (user/admin/moderator), ban-статус |
| rides | поездки: маршрут, время, места, статус |
| trip_requests | заявки на участие в поездке |
| ride_templates | шаблоны повторяющихся поездок |
| refresh_tokens | JWT refresh-токены (ротация) |
| revoked_tokens | отозванные токены |
| nonces | anti-replay для Telegram initData |
| notifications | очередь уведомлений |
| likes / reviews / complaints | социальные функции |
| support_messages | тикеты поддержки |
| audit_log | лог действий для модерации |
| error_log | клиентские и серверные ошибки |

**PII-шифрование:** `phone` и `apt_number` хранятся через `pgp_sym_encrypt` (pgcrypto), ключ — env var `PGCRYPTO_KEY`.

**NOTIFY-каналы:** `notify_user` (для notifier), `ride_updated` (для SSE realtime).

---

## Auth

```
1. Клиент получает Telegram.WebApp.initData
2. POST /api/auth/login { initData }
3. API проверяет HMAC-подпись (BOT_TOKEN как ключ)
4. Проверяет nonce (anti-replay, TTL 5 мин)
5. Создаёт/обновляет users запись
6. Возвращает accessToken (15 мин) + refreshToken (30 дней) в httpOnly cookie
7. Все запросы к API идут с cookie
8. accessToken истёк → POST /api/auth/refresh (ротация refreshToken)
```

---

## Инфраструктура

```
infra/
  docker-compose.dev.yml          — postgres + nominatim (для локальной разработки)
  docker-compose.prod.yml         — все сервисы (api/web/notifier/cron/webhook/postgres/nominatim)
  docker-compose.observability.yml — Prometheus, Grafana, Loki, Promtail, Uptime Kuma (опционально)
  postgres/
    postgresql.conf               — тюнинг под 50k users (shared_buffers, max_connections...)
    init/01-app-role.sql          — non-superuser app role
  prometheus/prometheus.yml       — scrape конфиг
  grafana/provisioning/           — datasources (Prometheus, Loki)
  loki/config.yml                 — retention 30d
  promtail/config.yml             — docker SD → loki
```

---

## CI/CD

```
.github/workflows/
  ci.yml       — на каждый push: lint → typecheck → unit → integration → security → web → coverage gate (95%)
  deploy.yml   — на push в main: build images → GHCR → trivy scan → SSH deploy → smoke → rollback при fail
  nightly.yml  — ежедневно: Trivy SARIF (все образы) + OWASP ZAP baseline + Lighthouse CI
```

**Deploy flow:** `scripts/deploy.sh SHA` → pre-deploy backup → migrate → docker compose up → healthcheck 60s → при fail → `scripts/rollback.sh`.
