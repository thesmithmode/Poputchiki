# SPEC: Архитектура Poputchiki

**Версия:** 0.1 (черновик к PRD v0.1)
**Дата:** 2026-05-01
**Статус:** Draft

> Документ описывает технические решения. Изменения архитектуры — через ревизию этого файла, не через ad-hoc правки в коде.

---

## 1. Обзор

```
┌──────────────────────────────────────────────────────────────────┐
│                  Telegram WebApp (iOS/Android/Desktop)           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  React SPA (Vite + TS)                                     │  │
│  │  - @telegram-apps/sdk-react                                │  │
│  │  - tg-identity-guard (свой; портирован из эталона)         │  │
│  │  - Supabase JS client (для RLS-протектед чтений)           │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS (Railway TLS)
                             │ initData → /auth/telegram
                             │ JWT → /api/**
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              Hono on Bun (Railway, single container)             │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Middleware chain:                                         │  │
│  │  rate-limit → cors → csp → auth-jwt → audit-log → handler  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Routes:                                                   │  │
│  │  /auth/telegram      (HMAC verify → mint Supabase JWT)     │  │
│  │  /api/rides          (CRUD)                                │  │
│  │  /api/reviews        (write-only публикация отзывов)       │  │
│  │  /api/favorites                                            │  │
│  │  /api/users/me                                             │  │
│  │  /api/admin/*        (role check: tg_id == ADMIN_TG_ID)    │  │
│  │  /webhooks/telegram  (push notifier callbacks)             │  │
│  │  /health, /readiness                                       │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Outbound:                                                 │  │
│  │  - Supabase JS (service role для write, RLS-bypass только  │  │
│  │    в audit-protected admin endpoints)                      │  │
│  │  - Telegram Bot API (notify)                               │  │
│  │  - Anthropic / Whisper (фаза 2)                            │  │
│  │  - PostHog (опционально)                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
└────────────────────────────┬─────────────────────────────────────┘
                             │ Postgres (TLS)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL + Auth + Realtime)         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Tables: users, rides, ride_templates, ride_requests,      │  │
│  │           reviews, favorites, private_notes, audit_log,    │  │
│  │           verification_requests, bans, nonces              │  │
│  │  RLS:    политики на каждой таблице                        │  │
│  │  MV:     driver_stats (refresh every 5 min)                │  │
│  │  Cron:   pg_cron — refresh MV, expand ride_templates,      │  │
│  │           archive expired rides, backup trigger            │  │
│  │  Storage: avatars (опционально, MVP берёт TG photo url)    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Структура репозитория

```
Poputchiki/
├── apps/
│   ├── api/                    # Hono backend (Bun)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── middleware/
│   │   │   ├── domain/         # бизнес-логика (доменные сервисы)
│   │   │   ├── infra/          # Supabase client, Telegram client
│   │   │   └── index.ts
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/    # против локальной Supabase
│   │   │   └── contract/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                    # React SPA (Vite)
│       ├── src/
│       │   ├── pages/
│       │   ├── components/
│       │   ├── hooks/
│       │   ├── lib/            # api client, telegram sdk wrappers
│       │   └── main.tsx
│       ├── tests/
│       │   ├── unit/           # vitest + testing-library
│       │   └── e2e/            # Playwright (через Telegram WebApp mock)
│       └── vite.config.ts
│
├── packages/
│   └── shared/                 # типы, zod-схемы, константы (общие для api+web)
│
├── supabase/
│   ├── migrations/             # SQL-миграции, версионируемые
│   ├── seed.sql
│   ├── policies/               # RLS-политики, отдельными файлами на таблицу
│   └── config.toml
│
├── docs/
│   ├── PRD-Poputchiki-v0.1.md
│   ├── SPEC-Architecture-v0.1.md  (этот файл)
│   └── OPEN-QUESTIONS-v0.1.md
│
├── scripts/                    # ralph.sh (адаптированный), backup, restore тесты
│
├── .github/workflows/          # CI: lint → typecheck → unit → integration → e2e → coverage gate
│
├── tasks.json                  # очередь задач для агента
├── progress.txt
└── CLAUDE.md
```

Принципы:
- **monorepo** через Bun workspaces (нативно поддерживается).
- `packages/shared` — Zod-схемы и DTO, переиспользуемые backend + frontend → contract drift невозможен.
- Никаких `.gitignore` (правило проекта).

---

## 3. Аутентификация (детально)

### 3.1 Контракт `/auth/telegram`
```
POST /auth/telegram
Content-Type: application/json
Body: { "initData": "<raw query string from Telegram.WebApp.initData>" }

200 → { "access_token": "<supabase-jwt>", "expires_at": 1735689600 }
401 → { "error": "invalid_init_data" | "expired" | "replay" | "infra" }
```

### 3.2 Алгоритм верификации
1. Парсим `initData` (URLSearchParams).
2. Достаём `hash`, остальные пары сортируем лексикографически и склеиваем как `key=value\nkey=value\n...`.
3. `secretKey = HMAC_SHA256("WebAppData", BOT_TOKEN)`.
4. `expected = HMAC_SHA256(secretKey, dataCheckString)`.
5. `MessageDigest.isEqual(expected, providedHash)` → констант-тайм сравнение.
6. `auth_date` в окне ±5 минут от now.
7. Replay: `setIfAbsent(nonce:{hash}, "1", TTL=5min)` в Supabase KV/Redis. Если ключ уже есть → 401 replay.
8. Fail-closed: при ошибке nonce-стора → 401 infra.
9. Upsert юзера: `users.tg_id` → если новый → создать, иначе обновить `last_seen_at` и `username`.
10. Вернуть Supabase JWT с claims: `{ sub: user.id, tg_id, role: "user"|"admin", iat, exp }`. Подпись — Supabase JWT secret.

### 3.3 Identity guard на клиенте
- Cookie `tg_uid` (HttpOnly=false, SameSite=Lax, Secure, Path=/).
- На каждой странице JS проверяет `cookie.tg_uid === Telegram.WebApp.initDataUnsafe.user.id`. Mismatch → форс re-auth (вызов `/auth/telegram` заново).

### 3.4 RLS-интеграция
- Все запросы фронта к Supabase идут с этим JWT.
- В RLS-политиках проверяем `auth.jwt() ->> 'tg_id' = users.tg_id` или `auth.uid() = ...`.

---

## 4. Модель данных (схема v0.1)

### 4.1 Таблицы

```sql
-- users: один пользователь = один tg_id
CREATE TABLE users (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_id        bigint UNIQUE NOT NULL,
  tg_username  text,
  display_name text NOT NULL,
  avatar_url   text,
  apt_number   text,                          -- зашифровано pgcrypto (pgp_sym_encrypt)
  phone_enc    bytea,                         -- pgcrypto, ключ в Supabase Vault
  is_verified  boolean NOT NULL DEFAULT false,
  is_banned    boolean NOT NULL DEFAULT false,
  role         text NOT NULL DEFAULT 'user',  -- user | admin
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

-- rides: разовая или экземпляр регулярной поездки
CREATE TABLE rides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id       uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  template_id     uuid REFERENCES ride_templates(id) ON DELETE SET NULL,
  direction       text NOT NULL,              -- нормализованное направление
  departure_at    timestamptz NOT NULL,
  price_rub       int,                        -- nullable = договорная
  seats_total     smallint NOT NULL CHECK (seats_total BETWEEN 1 AND 4),
  seats_taken     smallint NOT NULL DEFAULT 0,
  comment         text,
  status          text NOT NULL DEFAULT 'active',  -- active | cancelled | completed | archived
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (seats_taken <= seats_total)
);
CREATE INDEX idx_rides_status_dep ON rides (status, departure_at);

-- ride_templates: шаблон регулярного рейса
CREATE TABLE ride_templates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction     text NOT NULL,
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

-- reviews: публичный отзыв пассажира на водителя по конкретной поездке
CREATE TABLE reviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id      uuid NOT NULL REFERENCES rides(id) ON DELETE RESTRICT,
  driver_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  passenger_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text         text CHECK (length(text) <= 300),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, passenger_id)
);

-- favorites
CREATE TABLE favorites (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notify    boolean NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, driver_id)
);

-- private_notes: личные заметки юзера о водителе (только автор видит)
CREATE TABLE private_notes (
  user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note      text NOT NULL CHECK (length(note) <= 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, driver_id)
);

-- audit_log: каждое state-changing действие
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

-- verification_requests: заявки на верификацию водителя
CREATE TABLE verification_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload     jsonb NOT NULL,         -- что прислал (фото пропуска / номер квартиры)
  status      text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewer_id uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 Materialized view `driver_stats`

```sql
CREATE MATERIALIZED VIEW driver_stats AS
SELECT
  u.id AS driver_id,
  COUNT(DISTINCT r.id)                                  AS total_rides,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status='completed') AS completed_rides,
  AVG(rv.stars)                                          AS avg_stars,
  COUNT(rv.id)                                           AS reviews_count
FROM users u
LEFT JOIN rides r   ON r.driver_id = u.id
LEFT JOIN reviews rv ON rv.driver_id = u.id
GROUP BY u.id;

CREATE UNIQUE INDEX ON driver_stats (driver_id);
```
- Refresh CONCURRENTLY каждые 5 минут через `pg_cron`.

### 4.3 RLS политики (примеры)

```sql
ALTER TABLE rides ENABLE ROW LEVEL SECURITY;

-- читать активные поездки может любой авторизованный пользователь
CREATE POLICY rides_read ON rides FOR SELECT
USING (auth.uid() IS NOT NULL);

-- создавать только от своего имени
CREATE POLICY rides_insert ON rides FOR INSERT
WITH CHECK (driver_id = auth.uid());

-- редактировать/удалять — только водитель этой поездки
CREATE POLICY rides_update ON rides FOR UPDATE
USING (driver_id = auth.uid())
WITH CHECK (driver_id = auth.uid());

CREATE POLICY rides_delete ON rides FOR DELETE
USING (driver_id = auth.uid());
```
- Аналогично для всех остальных таблиц. Файлы — `supabase/policies/<table>.sql`.

---

## 5. API контракты (фрагмент)

Полные Zod-схемы в `packages/shared/src/schemas/`.

### 5.1 `POST /api/rides`
```ts
// request
{
  direction: string,         // 1..120 chars
  departureAt: string,       // ISO8601, future, ≤ +30 days
  priceRub: number | null,   // 0..5000 or null
  seatsTotal: 1|2|3|4,
  comment?: string           // ≤ 200 chars
}
// 201
{ id: string, ...ride }
// 422 zod errors / 401 unauthorized / 429 rate-limited
```

### 5.2 `GET /api/rides`
```
Query: direction?, fromAt?, toAt?, priceMax?, seatsMin?, verifiedOnly?, favoritesOnly?, cursor?
Response: { items: Ride[], nextCursor: string | null }
```

### 5.3 `POST /api/reviews`
```ts
{ rideId: string, stars: 1..5, text?: string }
// 201 review created, audit_log записан
// 409 already reviewed
// 403 not eligible (не был accepted на этой поездке)
```

### 5.4 Idempotency
Все POST-эндпоинты принимают `Idempotency-Key: <uuid>` header. Backend хранит (`key`, `user_id`, `response_hash`) 24 часа; повтор с тем же key → возвращает закэшированный 2xx.

---

## 6. Frontend архитектура

- **State**: TanStack Query для server-state, Zustand для UI-state (фильтры, модалки).
- **Routing**: React Router (hash-роутинг — Telegram WebApp иногда ломает history API).
- **Realtime**: подписка на Supabase channel `rides:active` через JS-клиент; auto-reconnect.
- **Telegram SDK**: `@telegram-apps/sdk-react` — viewport, theme, BackButton, MainButton, HapticFeedback.
- **Forms**: React Hook Form + zod resolver; те же схемы из `packages/shared`.
- **Стилизация**: TailwindCSS + `@telegram-apps/telegram-ui` (Telegram-нативные компоненты).

---

## 7. Testing strategy (TDD enforced)

| Уровень | Стек | Coverage gate | Где |
|---------|------|---------------|-----|
| Unit | Vitest | 90% lines, 85% branches | `apps/*/tests/unit`, `packages/shared/tests` |
| Integration (backend) | Vitest + supabase local (`supabase start`) | покрывает все RLS политики | `apps/api/tests/integration` |
| Contract | Zod schema parity check (api ↔ web) | 100% эндпоинтов | `apps/api/tests/contract` |
| E2E | Playwright + Telegram WebApp mock | критичные flows A–F из PRD | `apps/web/tests/e2e` |

**TDD enforcement**:
- Каждая задача в `tasks.json` имеет блок `tdd_steps` (red → green → refactor) ДО `implementation_steps`.
- Pre-commit hook отклоняет коммиты, в которых coverage упал >0.5%.
- CI: `lint → typecheck → unit → integration → e2e → coverage-gate`. Любой красный — блокировка merge.
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
    - bun run e2e
    - coverage gate (≥90% или fail)
  deploy (только на push в main):
    - бэкап Supabase pre-deploy (snapshot tag)
    - bun run db:migrate
    - railway up
    - smoke /health
    - на ошибке smoke → railway rollback
```

---

## 9. Бэкапы и DR

- **Daily**: Supabase auto-backup (включён в Pro tier).
- **Weekly full dump**: `pg_dump --format=custom --compress=9` → S3-совместимое хранилище (Backblaze B2 / Yandex Object Storage), encryption-at-rest (SSE-C ключ в Vault).
- **Retention**: daily 30 дней, weekly 6 месяцев, monthly 2 года.
- **Restore drill**: cron-job раз в месяц поднимает временный Postgres из последнего бэкапа, гонит smoke-тесты, отчитывается админу. Если restore failed — алерт.
- **Point-in-time recovery**: WAL архивация в Supabase Pro (по умолчанию 7 дней; рассмотреть upgrade до 28 дней).

---

## 10. Развёртывание

### 10.1 Railway (рекомендованный путь MVP)
- Один сервис: Bun runtime, контейнер собирается из Dockerfile.
- Переменные окружения: `BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `ADMIN_TG_ID`, `ANTHROPIC_API_KEY` (фаза 2), `WHISPER_API_KEY` (фаза 2), `POSTHOG_KEY` (опционально).
- TLS: автоматический через Railway domain (`*.up.railway.app`) или custom domain через CNAME.
- HTTPS-only force middleware.

### 10.2 Self-hosted (опция)
См. `OPEN-QUESTIONS-v0.1.md` — требует решения по SSL (Caddy / Traefik + Let's Encrypt), reverse proxy, мониторингу. Запасной план, не MVP.

---

## 11. Security checklist (минимум перед prod)

- [ ] HMAC verify Telegram initData — unit + integration тесты (включая negative cases: подменённый hash, истёкший auth_date, replay).
- [ ] RLS включён на каждой таблице, есть deny-by-default test.
- [ ] Persistent secrets в Vault, не в репо. Gitleaks pre-commit hook.
- [ ] Rate-limit на все public endpoints.
- [ ] CSP заголовки (script-src 'self' 'wasm-unsafe-eval' https://telegram.org).
- [ ] HSTS, X-Frame-Options DENY (но для Telegram iframe — рассмотреть allow), X-Content-Type-Options nosniff.
- [ ] CSRF protection на state-changing endpoints (двойной submit token + Origin check).
- [ ] Идемпотентность всех write-эндпоинтов.
- [ ] Аудит-лог пишет ip + user-agent + actor + payload hash.
- [ ] Шифрование phone/apt_number (pgcrypto).
- [ ] Backup restore-drill зелёный.
- [ ] OWASP ZAP / SQLMap прогон против staging.
- [ ] Зависимости проверены `bun audit` + `osv-scanner`.

---

## 12. Открытые архитектурные вопросы
См. `docs/OPEN-QUESTIONS-v0.1.md` — раздел «Архитектура».
