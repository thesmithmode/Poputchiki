# SPEC: Архитектура Poputchiki

**Версия:** 0.3 (черновик к PRD v0.3)
**Дата:** 2026-05-01
**Статус:** Draft

> Изменения 0.1 → 0.2 — в конце документа.

---

## 1. Обзор

```
┌──────────────────────────────────────────────────────────────────┐
│                  Telegram WebApp (iOS/Android/Desktop)           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React SPA (Vite + TS, hosted on Cloudflare Pages)         │  │
│  │  - @telegram-apps/sdk-react                                │  │
│  │  - tg-identity-guard (свой; портирован из эталона)         │  │
│  │  - Supabase JS client                                      │  │
│  │  - Leaflet + OpenStreetMap (карта)                         │  │
│  │  - PostHog browser SDK (опционально)                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS via Cloudflare Tunnel
                             │ initData → /auth/telegram
                             │ JWT → /api/**
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│        Cloudflare Tunnel  →  Docker Compose (домашний хост)      │
│        или Fly.io free tier (3×256MB shared-cpu VMs)             │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Контейнеры (микросервисы без избыточности):               │  │
│  │  1. api      — Hono on Bun, основной API                   │  │
│  │  2. notifier — Bun worker для Telegram pushes              │  │
│  │  3. cron     — Bun worker для scheduled tasks              │  │
│  │                (refresh MV, expand templates, backups)     │  │
│  │  4. nginx    — reverse proxy + статические health endpoints│  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ Postgres (TLS)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Supabase Free Tier                              │
│              (PostgreSQL + Auth + Realtime + Storage)            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Tables: users, rides, ride_templates, ride_requests,      │  │
│  │           ride_participation, likes, reviews, favorites,   │  │
│  │           private_notes, complaints, audit_log, nonces,    │  │
│  │           rate_limit_buckets, idempotency_keys             │  │
│  │  RLS:    deny-by-default + явные политики на каждой        │  │
│  │  MV:     user_stats (refresh every 5 min via cron worker)  │  │
│  │  Triggers: likes_count, reviews_avg                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

         Локальные бэкапы:  ./backups/poputchiki-YYYY-MM-DD.sql.zst.gpg
         (cron worker раз в сутки)
```

---

## 2. Структура репозитория

```
Poputchiki/
├── apps/
│   ├── api/                    # Hono backend (Bun) — основной API
│   ├── notifier/               # Bun worker — рассылка Telegram-уведомлений
│   └── cron/                   # Bun worker — scheduled jobs (бэкапы, refresh MV, expand templates)
│
├── web/                        # React SPA (Vite) — деплой Cloudflare Pages
│
├── packages/
│   └── shared/                 # типы, zod-схемы, константы (общие для api+web+workers)
│
├── supabase/
│   ├── migrations/             # SQL-миграции, версионируемые
│   ├── seed.sql
│   ├── policies/               # RLS-политики, отдельными файлами на таблицу
│   └── config.toml
│
├── infra/
│   ├── docker-compose.yml      # production compose (api + notifier + cron + nginx)
│   ├── docker-compose.dev.yml  # local dev (включая supabase локальный)
│   ├── nginx/
│   ├── cloudflared/            # Cloudflare Tunnel конфиг
│   └── flyio/                  # альтернативный деплой fly.toml + Dockerfiles
│
├── backups/                    # локальные бэкапы (внутри проекта, по правилу пользователя)
│   └── README.md               # GPG-ключ инструкция, retention policy
│
├── docs/
│   ├── PRD-Poputchiki-v0.1.md  (содержит v0.2)
│   ├── SPEC-Architecture-v0.1.md (этот файл, v0.2)
│   ├── OPEN-QUESTIONS-v0.1.md  (содержит v0.2)
│   └── AUTOMATION.md           — стратегия автономной разработки (Ralph vs Claude Code natives)
│
├── scripts/
│   ├── ralph.sh                # адаптированный для TS/Bun
│   ├── backup.sh               # вызывается из cron worker
│   └── restore-test.sh         # weekly drill
│
├── .github/workflows/          # CI: lint → typecheck → unit → integration → e2e → coverage gate
│
├── tasks.json                  # очередь задач для агента
├── progress.txt
├── CLAUDE.md
└── package.json                # bun workspaces root
```

Принципы:
- **Bun workspaces** — monorepo нативно.
- `packages/shared` — Zod-схемы и DTO, переиспользуемые backend + frontend → contract drift невозможен.
- **Никаких `.gitignore`** (правило проекта).
- Микросервисы маленькие и изолированные, но без избыточности (нет двух нод одного сервиса в MVP).

---

## 3. Аутентификация (детально)

### 3.1 Контракт `/auth/telegram`
```
POST /auth/telegram
Content-Type: application/json
Body: { "initData": "<raw query string from Telegram.WebApp.initData>" }

200 → { "access_token": "<supabase-jwt>", "expires_at": 1735689600 }
       Set-Cookie: tg_uid=<tg_user_id>; HttpOnly=false; SameSite=Lax; Secure; Path=/
401 → { "error": "invalid_init_data" | "expired" | "replay" | "infra" }
```

### 3.2 Алгоритм верификации
1. Парсим `initData` (URLSearchParams).
2. Достаём `hash`, остальные пары сортируем лексикографически и склеиваем как `key=value\nkey=value\n...`.
3. `secretKey = HMAC_SHA256("WebAppData", BOT_TOKEN)`.
4. `expected = HMAC_SHA256(secretKey, dataCheckString)`.
5. Constant-time сравнение (`crypto.timingSafeEqual`) → 401 если не совпало.
6. `auth_date` в окне ±5 минут от now.
7. Replay: `INSERT INTO nonces (hash, expires_at) ... ON CONFLICT DO NOTHING RETURNING 1` — если ничего не вернулось → 401 replay. (Postgres вместо Redis в MVP — экономим бесплатный slot.)
8. Fail-closed: при ошибке БД → 401 infra.
9. Upsert юзера: `users.tg_id` → если новый → создать, иначе обновить `last_seen_at` и `username`.
10. Вернуть Supabase JWT с claims: `{ sub: user.id, tg_id, role: "user"|"admin", iat, exp }`. Подпись — Supabase JWT secret.
11. Установить cookie `tg_uid` для identity guard.

### 3.3 Identity guard на клиенте + сервере (paranoid mode)
- **Клиент**: на каждой странице JS проверяет `cookie.tg_uid === Telegram.WebApp.initDataUnsafe.user.id`. Mismatch → форс re-auth.
- **Сервер (новое в v0.2)**: middleware на каждом `/api/**` запросе сверяет `cookie.tg_uid === jwt.tg_id`. Mismatch → 401 + Set-Cookie `tg_uid=; Max-Age=0` + invalidate JWT.
- Защищает от: переиспользования WebView attachment menu сессии другим пользователем; кражи JWT без cookie; кражи cookie без JWT.

### 3.4 RLS-интеграция
- Все запросы фронта к Supabase идут с этим JWT.
- В RLS-политиках проверяем `(auth.jwt() ->> 'tg_id')::bigint = users.tg_id` и каскадно для зависимых таблиц.

---

## 4. Модель данных (v0.2)

### 4.1 Таблицы

```sql
-- users: один пользователь = один tg_id
CREATE TABLE users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id                 bigint UNIQUE NOT NULL,
  tg_username           text,
  display_name          text NOT NULL,
  avatar_url            text,
  apt_number_enc        bytea,                         -- pgcrypto pgp_sym_encrypt
  phone_enc             bytea,                         -- pgcrypto
  is_verified           boolean NOT NULL DEFAULT false, -- зарезервировано под пост-MVP
  is_banned             boolean NOT NULL DEFAULT false,
  notify_disabled       boolean NOT NULL DEFAULT false, -- бот заблокирован пользователем
  role                  text NOT NULL DEFAULT 'user',
  likes_received_count  int NOT NULL DEFAULT 0,         -- денормализация для фильтров доверия
  rides_total_count     int NOT NULL DEFAULT 0,         -- денормализация
  rides_completed_count int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_trust ON users (created_at, likes_received_count);

-- rides: разовая или экземпляр регулярной поездки
CREATE TABLE rides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  template_id     uuid REFERENCES ride_templates(id) ON DELETE SET NULL,
  from_label      text NOT NULL,
  from_lat        double precision NOT NULL,
  from_lng        double precision NOT NULL,
  to_label        text NOT NULL,
  to_lat          double precision NOT NULL,
  to_lng          double precision NOT NULL,
  departure_at    timestamptz NOT NULL,
  price_rub       int,                        -- nullable = договорная
  seats_total     smallint NOT NULL CHECK (seats_total BETWEEN 1 AND 4),
  seats_taken     smallint NOT NULL DEFAULT 0,
  comment         text CHECK (length(comment) <= 200),
  status          text NOT NULL DEFAULT 'active',  -- active | cancelled | completed | archived
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_taken <= seats_total)
);
CREATE INDEX idx_rides_status_dep ON rides (status, departure_at);
CREATE INDEX idx_rides_driver ON rides (driver_id, departure_at DESC);
-- Гео-индекс под bounding-box запросы для карты:
CREATE INDEX idx_rides_geo_from ON rides (from_lat, from_lng) WHERE status='active';

-- ride_templates: шаблон регулярного рейса
CREATE TABLE ride_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_label    text NOT NULL,
  from_lat      double precision NOT NULL,
  from_lng      double precision NOT NULL,
  to_label      text NOT NULL,
  to_lat        double precision NOT NULL,
  to_lng        double precision NOT NULL,
  departure_time time NOT NULL,
  weekdays      smallint[] NOT NULL,          -- 0=Sun..6=Sat
  price_rub     int,
  seats_total   smallint NOT NULL,
  comment       text,
  active_from   date NOT NULL DEFAULT current_date,
  active_to     date,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ride_requests: отклик пассажира на поездку
CREATE TABLE ride_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending', -- pending | accepted | rejected | cancelled
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, passenger_id)
);

-- ride_participation: подтверждённое участие (предусловие для лайка/отзыва)
CREATE TABLE ride_participation (
  ride_id        uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  passenger_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_marked  boolean NOT NULL DEFAULT false,
  passenger_confirmed boolean NOT NULL DEFAULT false,
  marked_at      timestamptz,
  confirmed_at   timestamptz,
  PRIMARY KEY (ride_id, passenger_id)
);

-- likes: симметричные лайки 1/поездка
CREATE TABLE likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ride_id     uuid NOT NULL REFERENCES rides(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_id, target_id, ride_id),
  CHECK (subject_id <> target_id)
);
-- триггер: после INSERT/DELETE → обновить users.likes_received_count у target

-- reviews: симметричные отзывы (и водителю, и пассажиру)
CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      uuid NOT NULL REFERENCES rides(id) ON DELETE RESTRICT,
  subject_id   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text         text CHECK (length(text) <= 300),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, subject_id, target_id),
  CHECK (subject_id <> target_id)
);

-- favorites
CREATE TABLE favorites (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, target_id),
  CHECK (user_id <> target_id)
);

-- private_notes
CREATE TABLE private_notes (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       text NOT NULL CHECK (length(note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id)
);

-- complaints
CREATE TABLE complaints (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_ride_id  uuid REFERENCES rides(id) ON DELETE SET NULL,
  reason_code     text NOT NULL CHECK (reason_code IN ('spam','fraud','offense','other')),
  text            text CHECK (length(text) <= 500),
  status          text NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- антиспам: 1 жалоба от пары (reporter,target) в неделю; обеспечивается уникальным индексом по дате-неделе
  UNIQUE (reporter_id, target_user_id, target_ride_id, date_trunc('week', created_at))
);

-- audit_log
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  actor_id   uuid REFERENCES users(id),
  action     text NOT NULL,
  target_id  uuid,
  payload    jsonb,
  ip         inet,
  ua         text,
  ts         timestamptz NOT NULL DEFAULT now()
);

-- nonces: replay-защита initData
CREATE TABLE nonces (
  hash       text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_nonces_expires ON nonces (expires_at);
-- cron: DELETE FROM nonces WHERE expires_at < now() — каждые 5 минут

-- rate_limit_buckets: счётчики для rate-limiting
CREATE TABLE rate_limit_buckets (
  bucket_key  text PRIMARY KEY,        -- "user:{uuid}" или "ip:{inet}"
  window_at   timestamptz NOT NULL,
  hits        int NOT NULL DEFAULT 0
);

-- support_messages: обращения пользователей в техподдержку
CREATE TABLE support_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text         text NOT NULL CHECK (length(text) BETWEEN 1 AND 2000),
  status       text NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
  reply_text   text,
  replied_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_status ON support_messages (status, created_at DESC);

-- notification_preferences: выборочное отключение категорий
CREATE TABLE notification_preferences (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category  text NOT NULL CHECK (category IN (
              'ride_request',         -- кто-то откликнулся на твою поездку
              'ride_cancelled',       -- твоя поездка / поездка где ты пассажир отменена
              'confirm_participation',-- запрос подтверждения после departure_at
              'like_received',        -- получил лайк
              'review_received',      -- получил отзыв
              'favorite_new_ride',    -- избранный водитель опубликовал поездку
              'support_reply',        -- ответ от админа на твоё обращение
              'system'                -- системные алерты (мут запрещён)
            )),
  enabled   boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, category)
);
-- Дефолт: все категории кроме 'system' можно отключать; system всегда true (RLS блокирует UPDATE).

-- idempotency_keys
CREATE TABLE idempotency_keys (
  key            text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_hash  text NOT NULL,
  response_body  jsonb NOT NULL,
  status_code    smallint NOT NULL,
  expires_at     timestamptz NOT NULL
);
CREATE INDEX idx_idem_expires ON idempotency_keys (expires_at);
```

### 4.2 Materialized view `user_stats`

```sql
CREATE MATERIALIZED VIEW user_stats AS
SELECT
  u.id AS user_id,
  COUNT(DISTINCT r_drv.id) FILTER (WHERE r_drv.status='completed') AS rides_as_driver_completed,
  COUNT(DISTINCT rp.ride_id)                                       AS rides_as_passenger,
  COALESCE(SUM(CASE WHEN l.target_id = u.id THEN 1 ELSE 0 END), 0) AS likes_received,
  AVG(rv.stars) FILTER (WHERE rv.target_id = u.id)                 AS avg_stars,
  COUNT(rv.id) FILTER (WHERE rv.target_id = u.id)                  AS reviews_count
FROM users u
LEFT JOIN rides r_drv               ON r_drv.driver_id = u.id
LEFT JOIN ride_participation rp     ON rp.passenger_id = u.id AND rp.passenger_confirmed
LEFT JOIN likes l                   ON l.target_id = u.id
LEFT JOIN reviews rv                ON rv.target_id = u.id
GROUP BY u.id;

CREATE UNIQUE INDEX ON user_stats (user_id);
-- Refresh CONCURRENTLY каждые 5 минут (cron worker, без pg_cron — он недоступен на free tier).
```

### 4.3 RLS политики (deny-by-default)

```sql
-- На КАЖДОЙ таблице:
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides FORCE ROW LEVEL SECURITY;  -- даже для service_role нужны явные политики

-- Чтение: только авторизованные
CREATE POLICY rides_read ON rides FOR SELECT
USING (auth.jwt() IS NOT NULL);

-- INSERT: только от своего имени
CREATE POLICY rides_insert ON rides FOR INSERT
WITH CHECK (driver_id = auth.uid());

-- UPDATE: только водитель этой поездки
CREATE POLICY rides_update ON rides FOR UPDATE
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

-- DELETE: только водитель и только до departure_at
CREATE POLICY rides_delete ON rides FOR DELETE
USING (driver_id = auth.uid() AND departure_at > now());

-- Аналогично для всех остальных таблиц. Файлы — supabase/policies/<table>.sql.

-- Тест deny-by-default (CI gate):
-- 1. Анонимный клиент к каждой таблице: SELECT/INSERT/UPDATE/DELETE → ожидаем ноль строк / отказ.
-- 2. Авторизованный, но чужой ресурс: UPDATE/DELETE по чужим записям → отказ.
```

---

## 5. API контракты (фрагмент)

Полные Zod-схемы в `packages/shared/src/schemas/`.

### 5.1 `POST /api/rides`
```ts
{
  fromLabel: string,         // 1..120 chars
  fromLat: number,           // -90..90
  fromLng: number,           // -180..180
  toLabel: string,
  toLat: number,
  toLng: number,
  departureAt: string,       // ISO8601, future, ≤ +30 days
  priceRub: number | null,   // 0..5000 or null
  seatsTotal: 1|2|3|4,
  comment?: string,
  isRecurring?: boolean,
  weekdays?: number[]        // 0..6, требуется если isRecurring
}
// 201 → { ride: Ride }
// 422 zod errors / 401 unauthorized / 429 rate-limited
// 403 если у юзера >0 открытых жалоб с порогом или младше 24h и уже есть активная поездка
```

### 5.2 `GET /api/rides`
```
Query:
  fromLat?, fromLng?, toLat?, toLng?, radiusKm?  -- bbox/circle для карты
  fromAt?, toAt?
  priceMax?, seatsMin?
  trustMinAccountAgeDays?, trustMinLikes?
  favoritesOnly?
  cursor?
Response: { items: Ride[], nextCursor: string | null }
```

### 5.3 `POST /api/likes`
```ts
{ rideId: string, targetUserId: string }
// 201 если ride_participation подтверждён обеими сторонами
// 403 иначе
// 409 если уже лайк есть
```

### 5.4 `POST /api/reviews`
```ts
{ rideId: string, targetUserId: string, stars: 1..5, text?: string }
// 201 / 403 / 409 как у likes
```

### 5.5 Idempotency
Все POST-эндпоинты принимают `Idempotency-Key: <uuid>` header. Backend хранит ответ 24 часа в `idempotency_keys`; повтор с тем же ключом → возвращает закэшированный 2xx.

### 5.6 Anti-bot фильтр на сервере (помимо UI-фильтров пользователя)
- Запрос `POST /api/rides` от user'а с `created_at > now()-24h AND active_rides_count >= 1` → 403 `too_new`.
- Запрос от user'а с `likes_received_count = 0 AND rides_today >= 3` → 403 `unverified_daily_limit`.

---

## 6. Frontend архитектура

- **State**: TanStack Query для server-state, Zustand для UI-state (фильтры, модалки, view-mode list/map).
- **Routing**: React Router (hash-роутинг — Telegram WebApp иногда ломает history API).
- **Realtime**: подписка на Supabase channel `rides:active` через JS-клиент; auto-reconnect.
- **Telegram SDK**: `@telegram-apps/sdk-react` — viewport, theme, BackButton, MainButton, HapticFeedback.
- **Forms**: React Hook Form + zod resolver; те же схемы из `packages/shared`.
- **Стилизация**: TailwindCSS + `@telegram-apps/telegram-ui`.
- **Карта**: Leaflet + OpenStreetMap tiles, marker clustering (`leaflet.markercluster`), темизация под TG colorScheme.
- **Хостинг**: Cloudflare Pages (free, unlimited bandwidth). API host проброшен через env `VITE_API_BASE`.

---

## 7. Testing strategy (TDD enforced)

| Уровень | Стек | Coverage gate | Где |
|---------|------|---------------|-----|
| Unit | Vitest | 90% lines, 85% branches | `apps/*/tests/unit`, `packages/shared/tests` |
| Integration (backend) | Vitest + Supabase local (`supabase start`) | покрывает все RLS политики (deny-by-default test) | `apps/api/tests/integration` |
| Contract | Zod schema parity check (api ↔ web) | 100% эндпоинтов | `apps/api/tests/contract` |
| E2E | Playwright + Telegram WebApp mock | критичные flows A–G из PRD | `web/tests/e2e` |
| Security | напр. `deny-by-default.test.ts`, `replay.test.ts`, `identity-mismatch.test.ts` | 100% security-критичных путей | `apps/api/tests/security` |

**TDD enforcement**:
- Каждая задача в `tasks.json` имеет блок `tdd_steps` (red → green → refactor) ДО `implementation_steps`.
- Pre-commit hook отклоняет коммиты, если coverage упал >0.5% или новый файл без тестов.
- CI: `lint → typecheck → unit → integration → contract → e2e → security → coverage-gate`.
- Mutation testing (StrykerJS) — раз в неделю в CI nightly, target ≥ 60% mutation score.

---

## 8. CI/CD

GitHub Actions workflow:
```
on: [push, pull_request]
jobs:
  quality:
    - bun install
    - bun run lint
    - bun run typecheck
    - bun run test:unit -- --coverage
    - supabase start && bun run test:integration
    - bun run test:contract
    - bun run test:security
    - bun run test:e2e
    - coverage gate (≥90% или fail)
  deploy (только на push в main):
    - бэкап БД pre-deploy (вызов /admin/backup-now или скрипт)
    - bun run db:migrate
    - docker compose pull && docker compose up -d (на хосте через SSH/Cloudflare Tunnel)
        ИЛИ flyctl deploy (если деплой Fly.io)
    - cloudflare pages deploy (фронт)
    - smoke /health
    - на ошибке smoke → откат через docker compose previous tag
```

---

## 9. Бэкапы и DR

- **Frequency**: ежедневный `pg_dump --format=custom --compress=9 --verbose` через cron worker в `./backups/poputchiki-YYYY-MM-DD.dump`.
- **Encryption**: после dump → `gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY"`. Ключ — в env, в репо никогда.
- **Compression**: `zstd -19` поверх (двойная экономия).
- **Retention**: daily 30 дней, weekly 12 (понедельник), monthly 24 (1-е число).
- **Restore drill**: cron-job раз в неделю поднимает временный Postgres контейнер из последнего дампа, гонит smoke-тесты, отчитывается админу через TG-бот. Failed → блокирующий алерт.
- **Off-site copy** (фаза 1.5, опционально): rsync на второй личный диск/хост заказчика. В MVP — только локально.
- **Point-in-time recovery**: WAL на free Supabase — 7 дней по умолчанию.

---

## 10. Развёртывание

### 10.1 Целевая инфраструктура (утверждено заказчиком)
**Хост**: домашний/личный сервер с Docker. На сервере уже работает **Traefik** как reverse-proxy с ACME/Let's Encrypt. Публичный 443 открыт.

**Стек хостинга**:
```
Internet → Traefik (443, ACME) → Docker network "poputchiki"
                                   ├─ api      (Hono on Bun)
                                   ├─ notifier (Bun worker)
                                   ├─ cron     (Bun worker)
                                   └─ web      (статика SPA, можно отдавать через Traefik с Caddy/nginx или вынести на Cloudflare Pages)
```

### 10.2 Конфигурация Traefik (labels на сервисах)
Пример для `api`:
```yaml
services:
  api:
    image: poputchiki-api:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.poputchiki-api.rule=Host(`api.${DOMAIN}`)"
      - "traefik.http.routers.poputchiki-api.entrypoints=websecure"
      - "traefik.http.routers.poputchiki-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.poputchiki-api.loadbalancer.server.port=3000"
    networks:
      - traefik-public
      - poputchiki-internal
```

Аналогично `web` на `app.${DOMAIN}` (или единый Host с PathPrefix).

### 10.3 Домен — обязательное условие
Telegram MiniApp требует валидный TLS на домене; на bare IP не работает. У сервера должен быть DNS A-record на публичный IP. Варианты:
- **Существующий домен пользователя** + поддомен `app.<domain>` и `api.<domain>` (предпочтительно).
- **DuckDNS** — бесплатный поддомен `<имя>.duckdns.org`, A-record обновляется cron'ом, Let's Encrypt через `certbot --dns-duckdns` или Traefik с DNS challenge.
- **sslip.io / nip.io** — `<ip>.sslip.io` отдаёт A на сам IP; некрасиво, но работает.

**Action item**: уточнить у заказчика какой домен / поддомен закрепить за Poputchiki (см. OPEN-QUESTIONS).

### 10.4 Frontend: статика SPA
Два варианта (выбрать один):
- **Через Traefik на том же сервере**: build → docker volume → contoller-контейнер `caddy:alpine` отдаёт `dist/` на `app.${DOMAIN}`.
- **Cloudflare Pages**: автодеплой при push в main; unlimited bandwidth, edge cache; API host через `VITE_API_BASE=https://api.${DOMAIN}`.

Решение по умолчанию для MVP — **на сервере через Traefik**. Меньше внешних зависимостей; перенос на CF Pages — план B при росте трафика.

### 10.5 Секреты
**GitHub Secrets** (Actions) — единственный путь:
- В CI workflow секреты подставляются в job env.
- `docker compose up` запускается через SSH-step → `--env-file ./.env.deploy` (генерируется в job).
- Локально для разработки — `.env.local` на машине разработчика, в репо никогда.

**Список секретов**:
- `DOMAIN` (публичный, не секрет, но удобнее в одном месте)
- `BOT_TOKEN`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`
- `ADMIN_TG_ID`
- `ADMIN_TG_CHAT_ID` (куда шлются админ-алерты)
- `BACKUP_KEY` (GPG passphrase)
- `POSTHOG_KEY` (опц.)
- `SSH_HOST`, `SSH_USER`, `SSH_KEY` — для deploy job

### 10.6 Бэкапы
Локально на сервере в `./backups/` внутри docker volume:
- daily 30, weekly 12, monthly 24 — итого ~66 файлов.
- Ожидаемый размер MVP: <100MB сжатого → <7GB на retention. На сервере 20GB свободно — запас 3×.
- Restore drill: cron worker раз в неделю поднимает временный Postgres из последнего dump'а в отдельной docker network, гонит smoke, отчитывается админ-алертом.

### 10.7 Откат деплоя
- Каждый deploy тегается коммитом и docker image tag = git short sha.
- На сервере хранится последний и предпоследний tag.
- `make rollback` (или Actions workflow `rollback.yml`) переключает Traefik back на предыдущий tag — секунды.

---

## 11. Security checklist (минимум перед prod)

- [ ] HMAC verify Telegram initData — unit + integration тесты (negative cases: подменённый hash, истёкший auth_date, replay).
- [ ] Identity guard: cookie tg_uid ↔ jwt.tg_id ↔ Telegram.WebApp.initDataUnsafe.user.id — все 3 совпадают, иначе 401.
- [ ] RLS включён + FORCE на каждой таблице. Deny-by-default тест зелёный.
- [ ] Persistent secrets вне git (или в приватном репо явно, без публикации).
- [ ] Rate-limit на все public endpoints + on-create rules для anti-bot.
- [ ] CSP заголовки (script-src 'self' 'wasm-unsafe-eval' https://telegram.org).
- [ ] HSTS, X-Content-Type-Options nosniff. X-Frame-Options — особый случай для Telegram (см. ниже).
- [ ] CSRF protection (double-submit + Origin check) на state-changing endpoints.
- [ ] Идемпотентность всех write-эндпоинтов.
- [ ] Аудит-лог пишет ip + ua + actor + payload hash.
- [ ] Шифрование phone/apt_number (pgcrypto).
- [ ] Backup encrypted + restore-drill зелёный.
- [ ] OWASP ZAP / SQLMap прогон против staging.
- [ ] Зависимости проверены `bun audit` + `osv-scanner`.
- [ ] Все `text` поля санитизируются на выводе; никаких `innerHTML`.
- [ ] Жалобы не используются как DoS-вектор (антиспам по неделе).

**X-Frame-Options для Telegram**: TG WebApp работает в WebView, не классическом iframe; X-Frame-Options DENY обычно безопасно. Проверить на iOS/Android после первого деплоя.

---

## 12. Стратегия автономной разработки (Ralph + Claude Code natives)

См. отдельный документ `docs/AUTOMATION.md` — обсуждение использования внешнего bash-цикла vs встроенных возможностей Claude Code (Skills, Hooks, Subagents, /loop, /schedule, MCP, TaskCreate).

Краткое решение: **гибрид**.
- `tasks.json` остаётся persistent task store (читается между сессиями).
- `scripts/ralph.sh` — лёгкий headless-loop с safety (timeout, retry, логи, pre-flight, coverage-gate, graceful shutdown). Адаптирован под Bun/TS.
- Внутри сессии — Claude Code использует Skills (auto-work, brainstorming, TDD, debugging), TaskCreate для tracking шагов в рамках одной задачи, MCP (Supabase, Playwright, Context7), Subagents для параллельных независимых подзадач.
- Hooks: `PreToolUse(Bash:git push origin main)` → block (по правилу пользователя); `PostToolUse(Edit|Write)` → run lint+typecheck; `Stop` → run full test suite.

---

## 13. Открытые архитектурные вопросы
См. `docs/OPEN-QUESTIONS-v0.1.md` (актуальная v0.2) — раздел «Архитектура».

---

## CHANGELOG

### v0.3 (2026-05-01)
- Развёртывание перепроектировано: **домашний сервер + Traefik + Let's Encrypt + GitHub Secrets**. Cloudflare Tunnel отвергнут (избыточен при наличии публичного 443 и Traefik). Раздел §10 переписан: Traefik labels, домен через DuckDNS / sslip.io если нет своего, бэкапы локально на том же сервере, откат через docker tag.
- Добавлены таблицы `support_messages` (обращения в техподдержку с reply) и `notification_preferences` (выборочное отключение категорий push, system всегда активен).
- Внутри MVP frontend отдаётся через Traefik; Cloudflare Pages — план B.

### v0.2 (2026-05-01)
- Деплой пересмотрен под бюджет $0: Docker Compose + Cloudflare Tunnel (или Fly.io free) вместо Railway; Cloudflare Pages для фронта.
- Архитектура — 4 микросервиса в одном compose: api / notifier / cron / nginx; без избыточности (по одному инстансу).
- Бэкапы — локально в `./backups/`, GPG+zstd, weekly restore drill (вместо S3).
- nonce store — Postgres (таблица `nonces`) вместо Redis (экономим slot).
- Rate-limit store — Postgres (`rate_limit_buckets`).
- Добавлены сущности `likes`, `ride_participation`, `complaints`, `idempotency_keys`.
- В `users` — денормализованные счётчики `likes_received_count`, `rides_*_count` для быстрого фильтра доверия (триггеры обновляют).
- В `rides`/`ride_templates` добавлены геополя `from_lat/lng/to_lat/lng/from_label/to_label` для карты.
- Карта — Leaflet + OpenStreetMap (бесплатно).
- RLS — `FORCE ROW LEVEL SECURITY` (даже service_role требует явной политики); явный CI-тест deny-by-default.
- Identity guard расширен server-side проверкой cookie ↔ JWT.
- Anti-bot: серверные правила лимитов для свежих/безлайковых аккаунтов; UI-фильтры доверия.
- Подтверждение поездки обеими сторонами как предусловие лайка/отзыва.
- Симметричные отзывы (и водитель, и пассажир).
- Раздел «Стратегия автономной разработки» с указанием на `docs/AUTOMATION.md`.
