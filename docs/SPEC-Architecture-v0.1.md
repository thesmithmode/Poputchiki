# SPEC: Архитектура Poputchiki

**Версия:** 0.5 (черновик к PRD v0.4)
**Дата:** 2026-05-01
**Статус:** Draft

> Изменения по версиям — в конце документа.

## 0. Решения базовой инфраструктуры (must read)

- **БД** — self-hosted **PostgreSQL 16** в Docker (контейнер `postgres`). НЕ Supabase, НЕ Neon, НЕ managed. Бэкапы/PITR/RLS — наши.
- **Auth** — собственный JWT (HS256, секрет в env), HMAC-проверка Telegram initData в Hono middleware. НЕТ Supabase Auth.
- **Realtime** — Server-Sent Events через Hono endpoint, источник событий — Postgres `LISTEN/NOTIFY`. НЕТ Supabase Realtime, НЕТ WebSocket в MVP.
- **Storage** — TG photo URL для аватаров, без своего bucket. НЕТ Supabase Storage / S3 в MVP.
- **RLS** — Postgres native RLS, identity берётся из GUC `app.current_user_id` / `app.current_user_tg_id`, выставляются `apps/api` через `SET LOCAL` в начале каждой транзакции. НЕТ `auth.uid()` / `auth.jwt()` (это Supabase-функции, у нас их нет).
- **Frontend hosting** — статика SPA отдаётся Caddy-контейнером за Traefik, на том же сервере. НЕТ Cloudflare Pages, НЕТ Vercel.
- **HTTPS** — Traefik + Let's Encrypt на личном сервере с публичным 443. НЕТ Cloudflare Tunnel.
- **Метрики/observability** — `pino` JSON logs → файл с rotation, Prometheus scrape от self-hosted экспортёров (`postgres_exporter`, `node_exporter`, `cadvisor`), Grafana dashboard, Uptime Kuma для blackbox. Sentry — self-hosted compose ИЛИ fallback на собственный `error_log` table + admin TG-alert.
- **Аналитика** — отложено в фазу 2 (PostHog free tier — план B при росте).
- **Деплой** — Docker Compose на сервере, GHA build → SSH push → `docker compose up -d` → smoke /health → rollback по docker tag.

---

## 1. Обзор

```
┌──────────────────────────────────────────────────────────────────┐
│                  Telegram WebApp (iOS/Android/Desktop)           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React SPA (Vite + TS) — отдаётся Caddy-контейнером        │  │
│  │  - @telegram-apps/sdk-react                                │  │
│  │  - tg-identity-guard (свой; портирован из эталона)         │  │
│  │  - postgres-js НЕТ — фронт ходит только в /api/**          │  │
│  │  - Leaflet + OpenStreetMap (карта)                         │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS (Traefik + Let's Encrypt)
                             │ initData → POST /auth/telegram
                             │ JWT (Authorization Bearer) → /api/**
                             │ SSE GET /api/realtime/rides
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│   Domain (app.${DOMAIN} + api.${DOMAIN})                         │
│              ↓                                                   │
│   Traefik (443, ACME)                                            │
│              ↓                                                   │
│   Docker Compose network "poputchiki-internal"                   │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Микросервисы (Bun runtime, по одному инстансу в MVP):     │  │
│  │  1. api       — Hono — публичный REST + SSE                │  │
│  │  2. notifier  — worker — TG Bot push (LISTEN notify_user)  │  │
│  │  3. cron      — worker — scheduled jobs с advisory locks   │  │
│  │  4. webhook   — Hono — приёмник TG Bot webhook (bot_blocked│  │
│  │                /my_chat_member, slash-команды бота)        │  │
│  │  5. web       — caddy — статика SPA (build artefact)       │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ Postgres TCP (внутренняя сеть)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│   postgres:16-alpine (self-hosted, контейнер `postgres`)         │
│   + pgcrypto + pg_stat_statements                                │
│   data volume:    ./.docker-data/postgres                        │
│   backups volume: ./backups                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Tables: users, rides, ride_templates, ride_requests,      │  │
│  │           ride_participation, likes, reviews, favorites,   │  │
│  │           private_notes, complaints, audit_log, nonces,    │  │
│  │           rate_limit_buckets, idempotency_keys,            │  │
│  │           support_messages, notification_preferences,      │  │
│  │           revoked_tokens, error_log                        │  │
│  │  RLS:    deny-by-default + FORCE на каждой; identity       │  │
│  │           через GUC app.current_user_id / current_user_tg_id│  │
│  │  MV:     user_stats (REFRESH CONCURRENTLY каждые 5 мин)    │  │
│  │  Triggers: likes_count, rides_*_count, avg_stars,          │  │
│  │            updated_at, complaints_autoblock                │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

         Бэкапы:    ./backups/poputchiki-YYYY-MM-DD.dump.zst.gpg
                    (cron-worker, ежедневно 03:00 UTC, restore-drill weekly)
         Метрики:   postgres_exporter, node_exporter, cadvisor → Prometheus → Grafana
         Uptime:    Uptime Kuma (внешний blackbox /health)
         Sentry:    self-hosted compose (план A) | error_log table + admin TG (план B)
```

---

## 2. Структура репозитория

```
Poputchiki/
├── apps/
│   ├── api/                    # Hono backend (Bun) — REST + SSE
│   ├── notifier/               # Bun worker — рассылка Telegram-уведомлений
│   ├── cron/                   # Bun worker — scheduled jobs (refresh MV, expand templates, cleanup, backups, anomaly-detect)
│   ├── webhook/                # Hono — приёмник TG Bot webhook (bot_blocked, my_chat_member, /start /help)
│   └── web-server/             # Caddy образ с собранным SPA dist/
│
├── web/                        # React SPA (Vite) source
│
├── packages/
│   └── shared/                 # типы, zod-схемы, env-схема, константы (api+web+workers)
│
├── db/
│   ├── migrations/             # SQL-миграции (node-pg-migrate), версионируемые
│   ├── seeds/                  # сидовые скрипты (admin role bootstrap, dev fixtures)
│   ├── policies/               # RLS-политики отдельными файлами per-table (вспомогательно)
│   └── functions/              # SQL-функции (app.current_user_id, set_updated_at, anonymize_user)
│
├── infra/
│   ├── docker-compose.dev.yml  # local: postgres, nominatim, mailpit (если надо)
│   ├── docker-compose.prod.yml # prod: api, notifier, cron, webhook, web-server, prometheus stack (опц.)
│   ├── caddy/                  # Caddyfile (SPA fallback)
│   ├── prometheus/             # prometheus.yml + alerts.yml (опц.)
│   └── grafana/                # provisioning dashboards (опц.)
│
├── backups/                    # локальные бэкапы (gitignored data, README закоммичен)
│   └── README.md               # GPG retention policy
│
├── docs/
│   ├── PRD-Poputchiki-v0.1.md
│   ├── SPEC-Architecture-v0.1.md   (этот файл)
│   ├── OPEN-QUESTIONS-v0.1.md
│   ├── AUTOMATION.md
│   ├── design/                  # UI handoff (HTML+JSX прототипы)
│   ├── legal/                   # privacy-policy.md, terms-of-service.md
│   ├── runbook/                 # backup-restore.md, on-call.md, incident-template.md
│   └── security/                # threat-model.md, ban-evasion.md
│
├── scripts/
│   ├── backup-db.sh            # вызывается из cron worker
│   ├── restore-test.sh         # weekly drill
│   ├── deploy.sh               # SSH-step, вызывается из GHA
│   ├── rollback.sh             # переключение docker tag на предыдущий
│   ├── setup-dev-tls.sh        # mkcert для local HTTPS
│   ├── notify-admin.sh         # TG-уведомление админа
│   └── db-reset.sh             # local dev only
│
├── .github/workflows/
│   ├── ci.yml                  # lint → typecheck → unit → integration → contract → security → e2e → coverage gate
│   ├── deploy.yml              # build images → push → ssh deploy → smoke → rollback on fail
│   ├── nightly.yml             # mutation testing, OWASP ZAP baseline, Trivy image scan
│   └── rollback.yml            # manual workflow_dispatch — откат на предыдущий tag
│
├── tasks.json                  # очередь задач для агента
├── progress.txt
├── CLAUDE.md
└── package.json                # bun workspaces root
```

Принципы:
- **Bun workspaces** — monorepo нативно.
- `packages/shared` — Zod-схемы DTO + env, переиспользуемые backend + frontend → contract drift невозможен.
- `.gitignore` — только секреты (`.env*`, ключи, `./.docker-data/`, `./backups/*.dump.zst.gpg`). Всё остальное — в репо.
- Микросервисы маленькие и изолированные, по одному инстансу в MVP. Cron-jobs идемпотентны через advisory locks → можно безопасно scale-out при росте.

---

## 3. Аутентификация (детально)

### 3.1 Контракт `/auth/telegram`
```
POST /auth/telegram
Content-Type: application/json
Body: { "initData": "<raw query string from Telegram.WebApp.initData>" }

200 → { "access_token": "<jwt-24h>", "refresh_token": "<jwt-30d>", "expires_at": 1735689600 }
       Set-Cookie: tg_uid=<tg_user_id>; HttpOnly=false; SameSite=None; Secure; Path=/
       Set-Cookie: csrf_token=<random>; HttpOnly=false; SameSite=None; Secure; Path=/
401 → { "error": "invalid_init_data" | "expired" | "replay" | "infra" }

# Токены
- access_token TTL = 24h (claim exp).
- refresh_token TTL = 30d (claim typ='refresh', exp).
- POST /auth/refresh { refresh_token } → новый access_token; refresh_token ротируется.
- POST /auth/logout — инвалидирует refresh_token (запись в revoked_tokens), очищает cookie tg_uid и csrf_token.

# Cookie SameSite=None обязательно
Telegram WebApp в iOS/Android рендерится в кросс-сайт WebView (хост telegram.org → наш домен).
SameSite=Lax заблокирует cookie в кросс-сайт контексте → identity-guard сломается.
Только SameSite=None+Secure работает в TG WebView. Тест — TASK-FIX-COOKIE.
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
10. Вернуть собственный JWT (HS256) с claims: `{ sub: user.id, tg_id, role: "user"|"admin", typ: "access"|"refresh", jti, iat, exp }`. Секрет подписи — `JWT_SECRET` из env.
11. Установить cookie `tg_uid` для identity guard.

### 3.3 Identity guard на клиенте + сервере (paranoid mode)
- **Клиент**: на каждой странице JS проверяет `cookie.tg_uid === Telegram.WebApp.initDataUnsafe.user.id`. Mismatch → форс re-auth.
- **Сервер (новое в v0.2)**: middleware на каждом `/api/**` запросе сверяет `cookie.tg_uid === jwt.tg_id`. Mismatch → 401 + Set-Cookie `tg_uid=; Max-Age=0` + invalidate JWT.
- Защищает от: переиспользования WebView attachment menu сессии другим пользователем; кражи JWT без cookie; кражи cookie без JWT.

### 3.4 RLS-интеграция (self-hosted Postgres, без Supabase)

Поскольку наш Postgres self-hosted, у нас нет supabase-функций `auth.uid()` / `auth.jwt()`. Identity берём из Postgres GUC, выставляемых `apps/api` в начале каждой транзакции:

```sql
-- db/functions/000_app_identity.sql
CREATE SCHEMA IF NOT EXISTS app;

-- Текущий пользователь: его UUID
CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- Текущий пользователь: его tg_id (для cookie ↔ jwt sentinel и audit)
CREATE OR REPLACE FUNCTION app.current_user_tg_id() RETURNS bigint
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.current_user_tg_id', true), '')::bigint
$$;

-- Текущая роль (user/admin) — для admin-only политик
CREATE OR REPLACE FUNCTION app.current_user_role() RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'anon')
$$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.current_user_role() = 'admin'
$$;
```

В `apps/api/src/db/with-identity.ts` каждый запрос обёрнут так:

```ts
export async function withIdentity<T>(user: AuthUser | null, fn: (sql: Sql) => Promise<T>): Promise<T> {
  return db.begin(async (tx) => {
    if (user) {
      await tx`SELECT
        set_config('app.current_user_id',     ${user.id}::text, true),
        set_config('app.current_user_tg_id',  ${user.tgId}::text, true),
        set_config('app.current_user_role',   ${user.role}::text, true)`;
    }
    return fn(tx);
  });
}
```

Каждое RLS-выражение использует `app.current_user_id()` вместо `auth.uid()`. Анонимные запросы (без `set_config`) → функция возвращает `NULL` → policy не пропускает → deny-by-default.

Sentinel-тест (TASK-056 + TASK-114): запрос без `set_config` к каждой таблице возвращает 0 rows / отказ.

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
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Антиспам: 1 жалоба от пары (reporter,target,ride) в ISO-неделю.
-- Postgres не разрешает выражения в UNIQUE-constraint → partial UNIQUE INDEX поверх expression.
-- target_ride_id NULL обрабатывается через COALESCE до фиксированного UUID, иначе NULL≠NULL ломает индекс.
CREATE UNIQUE INDEX complaints_unique_per_week_idx ON complaints (
  reporter_id,
  target_user_id,
  COALESCE(target_ride_id, '00000000-0000-0000-0000-000000000000'::uuid),
  date_trunc('week', created_at)
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

### 4.3 RLS политики (deny-by-default, self-hosted)

Identity функции — см. §3.4. На КАЖДОЙ таблице:

```sql
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE rides FORCE ROW LEVEL SECURITY;  -- даже владелец БД проходит через политики

-- Чтение: только авторизованные (любой залогиненный видит активные поездки)
CREATE POLICY rides_read ON rides FOR SELECT
USING (app.current_user_id() IS NOT NULL);

-- INSERT: только от своего имени
CREATE POLICY rides_insert ON rides FOR INSERT
WITH CHECK (driver_id = app.current_user_id());

-- UPDATE: только водитель этой поездки
CREATE POLICY rides_update ON rides FOR UPDATE
USING (driver_id = app.current_user_id())
WITH CHECK (driver_id = app.current_user_id());

-- DELETE: только водитель и только до departure_at
CREATE POLICY rides_delete ON rides FOR DELETE
USING (driver_id = app.current_user_id() AND departure_at > now());

-- Admin override (где нужно — например support_messages, audit_log read):
CREATE POLICY support_messages_admin_read ON support_messages FOR SELECT
USING (app.is_admin());
```

Файлы политик — `db/policies/<table>.sql`, применяются миграциями `db/migrations/`.

**Тесты deny-by-default (TASK-056, CI gate)**:
1. Транзакция БЕЗ `set_config('app.current_user_id', ...)` к каждой таблице: `SELECT/INSERT/UPDATE/DELETE` → ноль строк / отказ.
2. Авторизованный, но чужой ресурс: `UPDATE/DELETE` по чужим записям → отказ.
3. Утечка identity между транзакциями — поскольку `set_config(..., true)` локальный для транзакции, после `COMMIT/ROLLBACK` identity сбрасывается. Sentinel-тест проверяет что следующий запрос в той же connection (из pool) не наследует identity.

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
- **Realtime**: SSE через Hono endpoint `GET /api/realtime/rides`, подписка фронта через `EventSource`. Источник событий — Postgres `LISTEN/NOTIFY` (канал `rides_changed`), publisher — триггеры на INSERT/UPDATE/DELETE в `rides`.
- **Realtime fallback**: при ошибке `EventSource` (5 reconnect failures подряд) — переключение на `setInterval(refetch, 30s)` polling через TanStack Query.
- **Telegram SDK**: `@telegram-apps/sdk-react` — viewport, theme, BackButton, MainButton, HapticFeedback.
- **Forms**: React Hook Form + zod resolver; те же схемы из `packages/shared`.
- **Стилизация**: TailwindCSS + `@telegram-apps/telegram-ui`.
- **Карта**: Leaflet + OpenStreetMap tiles, marker clustering (`leaflet.markercluster`), темизация под TG colorScheme.
- **Хостинг**: фронтенд отдаётся через Traefik на том же сервере (production); локально — Vite dev server.

### Дизайн UI

Готовый прототип всех экранов MVP — `docs/design/` (handoff bundle от Claude Design):
- `docs/design/project/Poputchiki Mini App.html` + `docs/design/project/src/*.jsx` — React+Babel inline прототип, разбитый по экранам (feed, map, detail, profile, create, address, filters).
- `docs/design/chats/chat1.md` — продуктовые решения и итерации (читать перед UI-имплементацией).
- `docs/design/IMPLEMENTATION-NOTES.md` — маппинг tasks.json → файлы дизайна, правила воспроизведения (пиксель-в-пиксель на нашем стеке Vite + React + TS + Tailwind, не копировать internal structure).

---

## 7. Testing strategy (TDD enforced)

| Уровень | Стек | Coverage gate | Где |
|---------|------|---------------|-----|
| Unit | Vitest | 90% lines, 85% branches | `apps/*/tests/unit`, `packages/shared/tests` |
| Integration (backend) | Vitest + Postgres test container (testcontainers-node ИЛИ docker compose -f docker-compose.dev.yml up postgres) | покрывает все RLS политики (deny-by-default test) | `apps/api/tests/integration` |
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

GitHub Actions workflow `.github/workflows/ci.yml`:
```yaml
on: [push, pull_request]
services:
  postgres:
    image: postgres:16-alpine
    env: { POSTGRES_USER: ci, POSTGRES_PASSWORD: ci, POSTGRES_DB: poputchiki_test }
    options: --health-cmd pg_isready
jobs:
  quality:
    - actions/checkout
    - oven-sh/setup-bun
    - bun install --frozen-lockfile
    - bun run lint
    - bun run typecheck
    - bun run db:migrate up                 # против postgres service container
    - bun run db:seed:test
    - bun run test:unit -- --coverage
    - bun run test:integration              # RLS, миграции, триггеры
    - bun run test:contract                 # zod schemas api↔web
    - bun run test:security                 # deny-by-default, replay, race, middleware-stack
    - bun run test:e2e                      # Playwright + apps/api dev + web build
    - bun run coverage:check                # ≥90% или fail
    - bun audit && npx -y osv-scanner --recursive
    - gitleaks detect --source . --no-git
```

Workflow `.github/workflows/deploy.yml` (только на push в `main`, см. TASK-115..TASK-125):
```yaml
on:
  push: { branches: [main] }
  workflow_dispatch:
jobs:
  build-and-push:
    - docker build apps/api → ghcr.io/.../api:${SHA}
    - docker build apps/notifier → ghcr.io/.../notifier:${SHA}
    - docker build apps/cron → ghcr.io/.../cron:${SHA}
    - docker build apps/webhook → ghcr.io/.../webhook:${SHA}
    - bun run build:web && docker build apps/web-server → ghcr.io/.../web:${SHA}
    - trivy image scan для каждого
  deploy:
    needs: build-and-push
    - SSH on host: scripts/deploy.sh ${SHA}
        # внутри:
        # 1. backup-db.sh pre-deploy → ./backups/pre-deploy-${SHA}.dump.zst.gpg
        # 2. docker compose -f infra/docker-compose.prod.yml pull
        # 3. docker compose -f ... run --rm api bun run db:migrate up
        # 4. docker compose -f ... up -d --no-deps api notifier cron webhook web-server
        # 5. сохранить prev tag в /opt/poputchiki/last-good-tag
    - smoke: curl -fsS https://api.${DOMAIN}/health → 200, https://app.${DOMAIN}/ → 200
    - smoke fail → scripts/rollback.sh prev-tag → notify admin TG
    - smoke ok → notify admin TG: ✅ deploy ${SHA}
```

Workflow `.github/workflows/nightly.yml`:
- mutation testing (StrykerJS) по `apps/api`, `apps/notifier`, `packages/shared`, target ≥60% mutation score.
- OWASP ZAP baseline scan против локально поднятого compose.
- Trivy image scan последних production images.
- Lighthouse CI против `web/dist`.

---

## 9. Бэкапы и DR

- **Frequency**: ежедневный `pg_dump --format=custom --compress=9 --verbose` через cron worker в `./backups/poputchiki-YYYY-MM-DD.dump`.
- **Encryption**: после dump → `gpg --symmetric --cipher-algo AES256 --batch --passphrase "$BACKUP_KEY"`. Ключ — в env, в репо никогда.
- **Compression**: `zstd -19` поверх (двойная экономия).
- **Retention**: daily 30 дней, weekly 12 (понедельник), monthly 24 (1-е число).
- **Restore drill**: cron-job раз в неделю поднимает временный Postgres контейнер из последнего дампа, гонит smoke-тесты, отчитывается админу через TG-бот. Failed → блокирующий алерт.
- **Off-site copy** (фаза 1.5, опционально): rsync на второй личный диск/хост заказчика. В MVP — только локально.
- **Point-in-time recovery (PITR)**: self-hosted Postgres с `wal_level=replica`, `archive_mode=on`, `archive_command=test ! -f /backups/wal/%f && cp %p /backups/wal/%f`. Retention WAL — 7 дней. Восстановление: `pg_basebackup` снимок (еженедельно) + WAL replay до целевого момента. Документировано в `docs/runbook/backup-restore.md` (TASK-119).

---

## 10. Развёртывание

### 10.1 Целевая инфраструктура (утверждено заказчиком)
**Хост**: домашний/личный сервер с Docker. На сервере уже работает **Traefik** как reverse-proxy с ACME/Let's Encrypt. Публичный 443 открыт.

**Стек хостинга**:
```
Internet → Traefik (443, ACME) → Docker network "poputchiki-internal"
                                   ├─ api         (Hono on Bun, Host=api.${DOMAIN})
                                   ├─ webhook     (Hono on Bun, Host=webhook.${DOMAIN})
                                   ├─ notifier    (Bun worker, internal-only)
                                   ├─ cron        (Bun worker, internal-only)
                                   ├─ web-server  (Caddy + SPA dist, Host=app.${DOMAIN})
                                   ├─ postgres    (postgres:16-alpine, internal-only)
                                   ├─ nominatim   (mediagis/nominatim, internal, geocoding proxy)
                                   ├─ prometheus  (опц., Host=metrics.${DOMAIN} с basic-auth)
                                   ├─ grafana     (опц., Host=grafana.${DOMAIN} с basic-auth)
                                   └─ uptime-kuma (опц., Host=status.${DOMAIN})
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
**Решение**: SPA build (`web/dist/`) копируется в `apps/web-server` (Caddy образ), отдаётся через Traefik на `app.${DOMAIN}`. Один Docker tag = один атомарный deploy фронта+бэка.

- Caddyfile: SPA fallback (`try_files $uri $uri/ /index.html`), gzip+brotli, cache-control `index.html=no-cache`, `*.js|*.css=public,max-age=31536000,immutable`.
- API host: `VITE_API_BASE=https://api.${DOMAIN}` зашивается в build при `bun run build:web` (compile-time env).
- Перенос на edge CDN — пост-MVP, план B при росте трафика.

### 10.5 Секреты
**GitHub Secrets** (Actions) — единственный путь:
- В CI workflow секреты подставляются в job env.
- `docker compose up` запускается через SSH-step → `--env-file ./.env.deploy` (генерируется в job).
- Локально для разработки — `.env.local` на машине разработчика, в репо никогда.

**Список секретов**:
- `DOMAIN` (публичный, не секрет, но удобнее в одном месте)
- `BOT_TOKEN`, `BOT_WEBHOOK_SECRET` (TG секрет в `setWebhook` для верификации заголовка `X-Telegram-Bot-Api-Secret-Token`)
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` (последний — composed)
- `JWT_SECRET` (для подписи access/refresh JWT, 32+ random bytes)
- `PGCRYPTO_KEY` (для pgp_sym_encrypt PII)
- `ADMIN_TG_ID`, `ADMIN_TG_CHAT_ID` (куда шлются админ-алерты)
- `BACKUP_KEY` (GPG passphrase для бэкапов)
- `TRUSTED_PROXIES` (CIDR list, default `172.16.0.0/12` для docker bridge)
- `SSH_HOST`, `SSH_USER`, `SSH_KEY` (для deploy job)
- `GHCR_TOKEN` (для push docker images в GitHub Container Registry)
- `SENTRY_DSN_API`, `SENTRY_DSN_WEB` (опц., если self-hosted Sentry поднят)
- `GRAFANA_ADMIN_PASSWORD`, `PROMETHEUS_BASIC_AUTH` (опц., для observability stack)

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
- [ ] CSP заголовки полные (см. ниже — script/style/img/connect/frame-ancestors/base/form-action).
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

### 11.1 Полная CSP

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' 'wasm-unsafe-eval' https://telegram.org https://*.telegram.org;
  style-src   'self' 'unsafe-inline';                     -- Leaflet inline-styles
  img-src     'self' data: blob: https://*.tile.openstreetmap.org https://*.telegram.org https://t.me;
  font-src    'self' data:;
  connect-src 'self' https://api.${DOMAIN} https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org;
  frame-ancestors https://web.telegram.org https://*.telegram.org;
  base-uri    'self';
  form-action 'self';
  object-src  'none';
  upgrade-insecure-requests;
```

Если geocoding self-host (TASK-FIX-GEO) — `nominatim.openstreetmap.org` заменить на свой origin.
SSE endpoint `/api/realtime/rides` входит в `connect-src 'self'` (тот же origin).

---

## 12. Стратегия автономной разработки (Ralph + Claude Code natives)

См. отдельный документ `docs/AUTOMATION.md` — обсуждение использования внешнего bash-цикла vs встроенных возможностей Claude Code (Skills, Hooks, Subagents, /loop, /schedule, MCP, TaskCreate).

Краткое решение: **гибрид**.
- `tasks.json` остаётся persistent task store (читается между сессиями).
- `scripts/ralph.sh` — лёгкий headless-loop с safety (timeout, retry, логи, pre-flight, coverage-gate, graceful shutdown). Адаптирован под Bun/TS.
- Внутри сессии — Claude Code использует Skills (auto-work, brainstorming, TDD, debugging), TaskCreate для tracking шагов в рамках одной задачи, MCP (Playwright, Context7), Subagents для параллельных независимых подзадач.
- Hooks: `PreToolUse(Bash:git push origin main)` → block (по правилу пользователя); `PostToolUse(Edit|Write)` → run lint+typecheck; `Stop` → run full test suite.

---

## 13. Открытые архитектурные вопросы
См. `docs/OPEN-QUESTIONS-v0.1.md` (актуальная v0.2) — раздел «Архитектура».

---

## 14. Масштабирование до 50 000 одновременных пользователей

**Целевая нагрузка:** 50 000 concurrent users (продуктовое требование).
Текущая MVP-архитектура рассчитана на ~300–1000 юзеров (один Docker Compose на домашнем сервере).
После завершения MVP вернуться к этому разделу и реализовать.

### Что нужно изменить

| Компонент | Проблема | Решение |
|---|---|---|
| **Postgres** | 50k connections = OOM | PgBouncer (connection pooling) + read replicas для SELECT |
| **SSE realtime** | 50k открытых HTTP-соединений на один процесс | Вынести SSE в отдельный stateful сервис; или переключиться на WebSocket + горизонтальное масштабирование |
| **LISTEN/NOTIFY** | При 50k подписчиках notification storm через один pg channel | Разбить на топики по ride_id; или заменить на Redis Pub/Sub |
| **rate_limit_buckets** | Hotspot при 50k rps в основной БД | Вынести rate-limit в Redis (atomic INCR + EXPIRE) |
| **API инстансы** | Один контейнер `api` — нет auto-scaling | Kubernetes или docker swarm с HPA; sticky sessions не нужны (stateless) |
| **Статика** | `web-server` контейнер под нагрузкой | CDN перед Traefik (Cloudflare / BunnyCDN) |
| **Postgres tuning** | Дефолтные `shared_buffers`, `max_connections` | Тюнинг под сервер (уже частично в TASK-120) + WAL-G для репликации |

### Что уже готово (масштабируется хорошо)
- Stateless Hono API — горизонтальное масштабирование без изменений
- RLS + SECURITY DEFINER функции — корректны при любом числе соединений
- Атомарный `app.book_seat()` — нет race condition даже при высоком параллелизме
- JWT без server-side sessions — нет sticky sessions
- Idempotency keys — защита от дублей при retry под нагрузкой

### Когда приступать
После `phase=prod-deploy` (TASK-115..125). Оформить как отдельную фазу `phase=scale`.

---

## CHANGELOG

### v0.5 (2026-05-01)

**Полное удаление Supabase из MVP** (заказчик подтвердил self-hosted Postgres в Docker микросервисами):
- §0 (новый): зафиксированы базовые инфраструктурные решения. Self-hosted Postgres 16, собственный JWT (HS256), SSE+LISTEN/NOTIFY вместо Supabase Realtime, TG photo URL вместо Storage, Caddy через Traefik вместо Cloudflare Pages.
- §1 диаграмма: убран блок «Supabase Free Tier», добавлены контейнеры `postgres`, `webhook`, `web-server`, `nominatim`, observability stack. Добавлены таблицы `revoked_tokens`, `error_log`. Триггеры `avg_stars`, `updated_at`, `complaints_autoblock`.
- §2 структура репо: вместо `supabase/` → `db/migrations`, `db/policies`, `db/functions`, `db/seeds`. Добавлены `apps/webhook`, `apps/web-server`, `docs/runbook`, `docs/security`, `infra/caddy`, `infra/prometheus`, `infra/grafana`. Скрипты `deploy.sh`, `rollback.sh`. Workflow `deploy.yml`, `nightly.yml`, `rollback.yml`.
- §3.4 RLS: убраны Supabase-функции `auth.uid()` / `auth.jwt()`. Введены SQL-функции в схеме `app`: `app.current_user_id()`, `app.current_user_tg_id()`, `app.current_user_role()`, `app.is_admin()`. Identity выставляется через `set_config('app.current_user_id', ..., true)` в начале каждой транзакции хелпером `withIdentity()`. Sentinel-тест на утечку identity между транзакциями (TASK-114).
- §4.3 RLS политики: переписаны под новые функции. Добавлен admin-override pattern.
- §6: SSE realtime fallback на 30s polling.
- §7: integration тесты на Postgres test container (testcontainers / docker compose), не `supabase start`.
- §8: расширен CI workflow + добавлен deploy workflow (TASK-115..125) + nightly (mutation, ZAP, Trivy, Lighthouse).
- §9: PITR через self-hosted WAL archive, не Supabase WAL.
- §10: список контейнеров за Traefik расширен, Cloudflare Pages убран как опция, observability контейнеры опционально на отдельных сабдоменах с basic-auth.
- §10.5: список секретов перепроверен. Убраны `SUPABASE_*`, добавлены `JWT_SECRET`, `PGCRYPTO_KEY`, `BOT_WEBHOOK_SECRET`, `TRUSTED_PROXIES`, `GHCR_TOKEN`, `SENTRY_DSN_*`, `GRAFANA_ADMIN_PASSWORD`.
- §12: убрана MCP `supabase`.

**Phase shift code-only-local → готовность к prod**: добавлены задачи TASK-107..125 в `tasks.json` (см. §13). Tasks → 106 + 19 = 125.

### v0.4 (2026-05-01)

Закрытие критических дыр в плане после ревью:

**Security**:
- §3.1 — JWT TTL зафиксирован: access 24h + refresh 30d. Endpoint `POST /auth/refresh` (TASK-066), `POST /auth/logout` (TASK-067). Таблица `revoked_tokens`.
- §3.1 — Cookie `tg_uid` и `csrf_token` теперь `SameSite=None; Secure` (TG WebView кросс-сайт; Lax не работает). FIX TASK-064.
- §11.1 — Полная CSP (img-src OSM tiles, connect-src api+nominatim, frame-ancestors telegram, style-src unsafe-inline для Leaflet, base/form/object). Sentinel-test TASK-065.
- §11 — Дополнения: CORS только DOMAIN (TASK-078), trustProxy/X-Forwarded-For (TASK-079), `/auth/*` IP rate-limit (TASK-080), env validation zod (TASK-081), logger redaction (TASK-082), middleware-stack sentinel (TASK-084), Postgres connection pool + isolation levels (TASK-101), Dependabot (TASK-097).

**Concurrency / data integrity**:
- §4.1 — `complaints` антиспам через **partial UNIQUE INDEX** с COALESCE+date_trunc вместо невалидного UNIQUE constraint (FIX TASK-068).
- Atomic seat booking через `UPDATE ... WHERE seats_taken<seats_total RETURNING` (TASK-069). Sentinel race-test 10 параллельных (TASK-085).
- Counter triggers с `FOR NO KEY UPDATE` против lost-update; sentinel 100 concurrent INSERT likes (TASK-086).
- Cron jobs обёрнуты в `pg_try_advisory_lock` (TASK-089).

**Missing endpoints**:
- `GET /api/users/me` (TASK-073), `GET /api/users/:id` (TASK-074), `PATCH /api/users/me` (TASK-075), `DELETE /api/users/me` (TASK-076 — 152-ФЗ право на удаление, soft-delete + анонимизация).
- `GET /api/users/:id/schedule` (TASK-077).
- `PATCH /api/rides/:id` (TASK-071), `PATCH /api/rides/:id/cancel` (TASK-072).
- `POST /api/rides/:id/request` + accept/reject/cancel ride_requests (TASK-069, TASK-070).

**Operational / прод-ready**:
- Geocoding self-hosted Nominatim + proxy `/api/geocode` (TASK-092).
- Local HTTPS dev через mkcert (TASK-096).
- Admin bootstrap через db:seed (TASK-093).
- Privacy Policy + ToS текст docs/legal/* + /privacy /terms роуты в web (TASK-094, TASK-095).
- Sentry / error tracking (TASK-098).
- Web production build + caddy serve (TASK-099).
- Banned-user UI + backend 403 (TASK-100).
- 404 + offline state (TASK-104).
- Settings UI: logout + delete account (TASK-105).
- Audit log partitioning + retention 12 месяцев (TASK-088).
- LISTEN/NOTIFY reconnect backoff (TASK-090).
- Updated_at триггеры (TASK-091).
- Ban evasion documentation + anomaly monitoring (TASK-103).
- Anti-bot middleware refactor (TASK-102): убрать inline из TASK-014, использовать TASK-053 на всех нужных routes.

**CI**:
- TASK-019 расширен: `test:security` + `test:e2e` + Postgres service container с миграциями + audit/gitleaks шаги.

Итого: tasks.json 63 → 106 задач. План считается production-ready.

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
