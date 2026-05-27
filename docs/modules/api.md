# apps/api

HTTP API сервис. Hono + Bun, порт 3000.

## Точки входа

| Метод | Путь | Назначение |
|-------|------|-----------|
| GET | /health | liveness probe |
| GET | /ready | readiness (проверяет DB) |
| GET | /metrics | Prometheus-совместимые метрики |
| POST | /api/auth/login | Telegram initData → JWT |
| POST | /api/auth/refresh | обновление accessToken |
| POST | /api/auth/logout | отзыв refreshToken |
| GET/POST/PATCH/DELETE | /api/rides/* | CRUD поездок |
| GET/POST | /api/ride-requests/* | заявки на участие |
| GET/POST | /api/ride-templates/* | шаблоны поездок |
| GET/PATCH | /api/users/:id | профили |
| GET/POST/DELETE | /api/favorites | избранные маршруты |
| POST/DELETE | /api/likes | лайки |
| GET/POST | /api/reviews | отзывы |
| POST | /api/complaints | жалобы |
| POST | /api/support | тикеты поддержки |
| GET | /api/notifications | уведомления пользователя |
| GET | /api/realtime | SSE-стрим |
| GET | /api/geocode | прокси → Nominatim |
| POST | /api/client-errors | сбор ошибок фронта (без auth) |

## Middleware (порядок применения)

1. `request-id` — генерирует X-Request-Id, создаёт child logger
2. `secure-headers` — HSTS, X-Content-Type-Options, Referrer-Policy
3. `cors` — разрешает только домен приложения
4. `rate-limit` — 100 req/min по IP (in-memory, sliding window)
5. `auth-rate-limit` — отдельный лимит для /auth/login (10 req/min)
6. `identity-guard` — верифицирует JWT, кладёт user в context
7. `banned-user` — блокирует забаненных после проверки JWT
8. `csrf` — double-submit cookie для мутаций
9. `idempotency` — дедупликация POST по Idempotency-Key
10. `anti-bot` — rate limit + fingerprint для auth/login
11. `audit-log` — пишет мутации в audit_log (async, не блокирует)
12. `error-capture` — перехватывает необработанные ошибки через app.onError

## RLS

Каждый запрос к БД через `withIdentity(sql, userId, fn)`:
```typescript
await sql.begin(async tx => {
  await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
  return fn(tx);
});
```
PostgreSQL RLS-политики используют `current_setting('app.current_user_id')`.

## Переменные окружения

`DATABASE_URL`, `JWT_SECRET`, `WEBHOOK_SECRET`, `PGCRYPTO_KEY`, `NOMINATIM_URL`, `PORT` (default: 3000), `LOG_LEVEL` (default: info)

## Тесты

`apps/api/tests/unit/` — unit-тесты middleware, lib, отдельных функций
`apps/api/tests/integration/` — тесты роутеров с реальной БД (Vitest + testcontainers)
Coverage gate: 95% line/branch/function/statement
