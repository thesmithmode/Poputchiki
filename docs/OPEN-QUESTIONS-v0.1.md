# Открытые вопросы и слепые зоны — Poputchiki

**Версия:** 0.4
**Дата:** 2026-05-01
**Контекст:** заказчик подтвердил self-hosted Docker микросервисы 2026-05-01 (вторая сессия), Supabase удалён везде. Ниже — статус каждого пункта (RESOLVED / OPEN), плюс новые вопросы, всплывшие в ходе уточнений.

> Формат: `[категория] Вопрос → текущее решение / предположение → почему критично.`

---

## A. Продукт и сообщество

### A.1 [онбординг] Кто допускается в приложение?
**Статус:** RESOLVED.
**Решение:** регистрация открытая (любой Telegram-пользователь). Защита от ботов и абьюза — через фильтры доверия (возраст аккаунта, лайки) и серверные лимиты для свежих/безлайковых аккаунтов. См. PRD §3.2 и SPEC §5.6.

### A.2 [роли] Как защититься от фейк-водителей?
**Статус:** RESOLVED.
**Решение:** в MVP водителем может быть любой авторизованный пользователь. Верификация (фото пропуска / приглашение / проверка автомобиля) — отложена в пост-MVP. В MVP действуют фильтры доверия + автоблок при пороге жалоб (≥5 жалоб от ≥5 пользователей за 7 дней).

### A.3 [ЖК] Один ЖК или мульти-tenant?
**Статус:** OPEN (решение по умолчанию).
**Текущее предположение:** один ЖК (Царёво); схема не имеет `tenant_id` пока, добавим миграцией при появлении второго ЖК.
**Почему критично:** влияет на схему БД и RLS. В v0.2 решение — отложить tenant до фактического второго ЖК.

---

## B. Auth и SSL

### B.1 [SSL/Deploy] Какой путь к HTTPS-домену?
**Статус:** RESOLVED.
**Решение:** домашний/личный сервер с Docker, на нём уже работает **Traefik** + ACME/Let's Encrypt. Публичный 443 открыт. Cloudflare Tunnel **не используется** (избыточен). См. SPEC §10.

**OPEN sub-question (новое):** какой домен/поддомен закрепить за Poputchiki?
- Если у заказчика есть свой домен на этом сервере — поддомены `app.<domain>` (фронт) и `api.<domain>` (бэк).
- Если домена нет — DuckDNS бесплатный (`<имя>.duckdns.org`), обновляемый cron'ом + Traefik DNS-challenge.
- sslip.io как самый ленивый план («`<ip>.sslip.io`», но некрасиво в Telegram).
**Action item:** Антон уточняет.

### B.2 [auth] Где живёт логика верификации Telegram initData?
**Статус:** RESOLVED.
**Решение:** в Hono-middleware `apps/api` (наш TCB). Self-hosted, никаких внешних edge functions. Эталон портируется из `Telegram-export-clean`. JWT (HS256) подписывается `JWT_SECRET` из env, refresh-токен в `revoked_tokens` для ротации.

### B.3 [identity-guard] Cookie или localStorage?
**Статус:** RESOLVED — выбран максимально параноидный вариант.
**Решение:** cookie `tg_uid` (HttpOnly=false, для клиентского сравнения с initDataUnsafe) **+ server-side middleware** на каждом запросе сверяет `cookie.tg_uid === jwt.tg_id`. Mismatch → 401, Set-Cookie expire, force re-auth. Защита от: переиспользования WebView attachment menu, кражи только cookie без JWT, кражи только JWT без cookie.

---

## C. Данные и приватность

### C.1 [ПД] ФЗ-152 — нужен ли уведомительный учёт оператора ПД?
**Статус:** OPEN.
**Текущее предположение (в v0.2):** проект приватный, пользователь принимает риск формальной непостановки на учёт. Если пойдёт в публичную монетизацию — оформить статус оператора.
**Action item:** поднять при переходе в фазу 2 (введение подписки).

### C.2 [бэкапы] Куда бэкапим?
**Статус:** RESOLVED.
**Решение:** локально в папку `./backups/` внутри проекта. GPG+zstd. Retention 30 daily / 12 weekly / 24 monthly. Off-site копия на второй личный диск/хост — фаза 1.5, опционально.

### C.3 [ретеншн] Сколько хранить отменённые поездки и истёкшие отзывы?
**Статус:** OPEN — решение по умолчанию.
**Текущее предположение:** активные → навсегда; отменённые → 90 дней; завершённые архивные → 2 года; отзывы → навсегда.
**Действие:** если пользователь хочет иное — поправить.

### C.4 [GDPR-like] Право на удаление аккаунта
**Статус:** OPEN — решение по умолчанию.
**Текущее предположение:** есть удаление аккаунта; каскадное на ride_requests/favorites/private_notes; отзывы и лайки анонимизируются (`subject_id = NULL`), но не удаляются — иначе ломается история другого пользователя.

---

## D. Архитектура и инфраструктура

### D.1 [Redis или Postgres для nonce/rate-limit?]
**Статус:** RESOLVED.
**Решение:** Postgres (таблицы `nonces`, `rate_limit_buckets`) — экономим free slot Redis. Перейдём на Upstash / managed Redis при превышении 50 RPS, когда blocking SQL станет горлышком.

### D.2 [realtime] Чем делать realtime в self-hosted Postgres?
**Статус:** RESOLVED.
**Решение:** SSE через Hono (`GET /api/realtime/rides`), источник событий — Postgres `LISTEN/NOTIFY` (канал `rides_changed`, publisher — триггеры на INSERT/UPDATE/DELETE rides). Fallback на 30s polling после 5 reconnect failures. WebSocket / отдельный broker (NATS, Redis pub/sub) — пост-MVP при нагрузке >500 одновременных SSE.

### D.3 [TG bot] — отдельный или MiniApp Bot?
**Статус:** RESOLVED.
**Решение:** один и тот же бот (через который запускается MiniApp) шлёт push. `bot_blocked`-событие → пометка `users.notify_disabled=true`.

### D.4 [рейтинг] Простой avg или Bayesian?
**Статус:** OPEN — решение по умолчанию.
**Текущее предположение:** простое среднее по `reviews.stars` + отдельный счётчик `likes_received_count`. Bayesian average при появлении манипуляций (в фазе 1.5).

### D.5 [хостинг] Где разворачиваем prod?
**Статус:** RESOLVED.
**Решение:** домашний сервер заказчика с Docker + Traefik + Let's Encrypt. Все компоненты (api, notifier, cron, webhook, web-server, postgres, nominatim) в одной docker-сети `poputchiki-internal`. Внешние сервисы (Fly.io / Cloudflare / Vercel / Supabase / Neon) **не используются**. Платный managed — только при росте нагрузки выше возможностей домашнего сервера, документировано в roadmap.

### D.6 [карта] Leaflet/OSM или платный SDK?
**Статус:** RESOLVED.
**Решение:** Leaflet + OpenStreetMap в MVP — бесплатно, без квот, без ключей. Реальное routing — фаза 1.5 через OSRM self-hosted или Yandex Maps API (free до 25k/день).

---

## E. Автономный цикл разработки

### E.1 [ralph.sh] Адаптируем существующий или используем Claude Code natives?
**Статус:** RESOLVED — гибрид.
**Решение:** см. `docs/AUTOMATION.md`. Внешний bash-loop остаётся для headless ticking + safety; внутри сессии Claude использует встроенные Skills/Hooks/Subagents/MCP/TaskCreate.

### E.2 [task сегментация] Размер одной задачи
**Статус:** RESOLVED (как в шаблоне).
**Решение:** 30 минут агентского времени; зависимости явно через `dependencies`.

### E.3 [тесты] Что блокирует «зелёный pipeline»?
**Статус:** RESOLVED.
**Решение:** lint + typecheck + unit (≥90%) + integration + contract + security (deny-by-default + replay) + e2e + coverage-gate. Mutation testing — nightly, не блок.

### E.4 [secrets для Claude в Ralph] Где живут API keys?
**Статус:** RESOLVED.
**Решение:** локально на машине заказчика, env. CI на GitHub — service tokens через Actions secrets.

---

## F. Юр / контентные

### F.1 [TOS / Privacy Policy]
**Статус:** OPEN, но пропускаем в черновике.
**Текущее предположение:** короткая оферта при первом входе — генерируем шаблон в фазе перед публичным запуском.

### F.2 [таксомоторная деятельность]
**Статус:** RESOLVED по позиционированию.
**Решение:** «площадка для попутчиков» (BlaBlaCar-style), не оператор перевозки; в MVP деньги через сервис не идут вовсе. При введении платежей в фазе 2 — повторный аудит.

---

## G. Метрики и аналитика

### G.1 [Аналитика] Где трекать продуктовые события?
**Статус:** RESOLVED для MVP — отложено в фазу 2.
**Решение:** в MVP продуктовая аналитика не нужна (один ЖК, обратная связь напрямую от пользователей в TG). События записываются в `audit_log` (action+actor+ts), агрегаты — SQL-запросами или materialized view `product_metrics_daily`. PostHog (Cloud free либо self-hosted) — рассмотреть в фазе 2 при появлении необходимости в funnels/cohorts/replay.

---

## H. Roadmap-вопросы

### H.1 [платежи] Какой канал первым?
**Статус:** OPEN — отложено в фазу 2.
**Текущее предположение:** TG Stars как самый дружественный к Telegram MiniApp; СБП — параллельно при наличии юрлица; крипта — низкий приоритет.

### H.2 [двусторонний рейтинг] Когда?
**Статус:** RESOLVED.
**Решение:** в схему заложено сразу (симметричные `reviews.subject_id/target_id`), UI MVP — обе стороны видят и ставят. Детальные публичные страницы рейтинга пассажира — фаза 2.

### H.3 [геокодирование] Сразу или позже?
**Статус:** RESOLVED.
**Решение:** карта с точками и линиями уже в MVP. Реальное routing/geocoding — фаза 1.5.

---

## I. Новые вопросы (всплыли в v0.2)

### I.1 [Let's Encrypt — стабильность]
**Риск:** rate-limits Let's Encrypt (50 cert/week per registered domain) при экспериментах.
**Митигация:** Traefik кэширует cert в `acme.json`; не пересоздавать сервис без причины. На случай rate-limit — staging endpoint LE для тестов.

### I.2 [Anti-bot для жалоб] DoS-вектор через массовые жалобы?
**Текущее решение:** UNIQUE-ограничение по `(reporter_id, target_user_id, target_ride_id, week)`. Гарантирует 1 жалоба от пары в неделю.
**Открыто:** не достаточно ли это? Если нужна более жёсткая защита — добавить cooldown 1 жалоба от одного пользователя в день в принципе, без привязки к таргету. Принять решение по факту первых жалоб.

### I.3 [Бэкап на медленном сервере] Cron, занимающий I/O пика
**Статус:** RESOLVED (self-hosted-friendly).
**Митигация:** запускать cron-worker в 03:00 UTC (ночь по Москве); `pg_dump --format=custom --jobs=1` (без параллельности → меньше I/O пика); WAL archiving работает в фоне без всплесков (`archive_command`); основной snapshot — `pg_basebackup` раз в неделю в воскресенье 04:00 UTC. Restore-drill использует уже снятый dump, не дёргает прод.

### I.4 [Идемпотентность retry в notifier] Дублирующие пуши?
**Открыто:** при retry на TG Bot API нужна дедупликация. Решение: notifier хранит `(notification_id, sent_at)`; при retry — проверяет sent_at < N минут → skip.

### I.5 [Storage для аватаров] TG photo URL или собственный bucket?
**Статус:** RESOLVED.
**Решение:** TG photo URL — бесплатно, актуально, нет своего хранилища. Storage / S3-bucket в MVP не разворачиваем.
**Fallback:** при отсутствии photo_url или 404 от TG — клиент генерит identicon (`boring-avatars` или собственный SVG) детерминистически из `tg_id`. Sentinel-тест: имитация 404 → identicon отображается (TASK-117).

### I.6 [Edge cases] iOS Safari WebView и cookie с SameSite=Lax
**Известная проблема:** iOS иногда не отправляет Lax cookies при cross-origin top-level navigation в WebView.
**Открыто:** проверить экспериментально на первом деплое; план B — Authorization header вместо cookies для identity guard, минус client-side проверка пропадает (но это не критично, server-side остаётся).

### I.7 [Bun lockfile vs Node ecosystem]
**Риск:** не все npm-пакеты совместимы с Bun runtime.
**Митигация:** при ошибке — fallback на Node.js для конкретного контейнера (notifier, cron); api остаётся на Bun.

---

## J. Быстрый action items список (актуально на v0.4)

1. **Какой домен/поддомен** закрепить за Poputchiki? Свой? DuckDNS?
2. **`ADMIN_TG_CHAT_ID`** — куда слать админ-алерты (личный чат с ботом, отдельная группа, канал)?
3. **Список техподдержки** — только Антон, или есть ещё доверенные модераторы (тогда нужна роль `moderator` в `users`)?
4. **Observability stack** — поднимаем Prometheus+Grafana+Uptime Kuma сейчас или откладываем до post-launch (есть только Sentry / собственный error_log + admin TG)?
5. **Разрешать ли `git push origin dev`** автономно (без подтверждения каждый раз) — RESOLVED, разрешено по CLAUDE.md.

### Ответы заказчика 2026-05-01 на предыдущие вопросы (v0.3 → v0.4)

- ✅ **Self-hosted всё**: Postgres в Docker, никакого Supabase. Микросервисы (api, notifier, cron, webhook, web-server) в одном compose.
- ✅ Frontend — Caddy за Traefik на том же сервере. CF Pages не используем.
- ✅ MVP включает деплой в прод (не code-only-local). Добавлены задачи TASK-115..125 по deploy pipeline.
- ✅ Аналитика отложена в фазу 2.
- ✅ Storage аватаров — TG photo URL + identicon fallback.

### Ответы заказчика 2026-05-01 на предыдущие вопросы (v0.2 → v0.3)

- ✅ Публичный IP + 443 — ДА (через Traefik уже настроено).
- ✅ Cloudflare Tunnel — НЕ нужен (Traefik закрывает потребность).
- ✅ Свободно на сервере для бэкапов — 20GB+, хватит.
- ✅ Секреты — GitHub Secrets, доступны в Actions; локально `.env.local` на машине разработчика.
- ✅ TG-алерты разделены: админ (Антон) — ошибки + новые саппорт-тикеты + новые жалобы; пользователи — категории `notification_preferences` (см. SPEC §4 + PRD §4.8).
