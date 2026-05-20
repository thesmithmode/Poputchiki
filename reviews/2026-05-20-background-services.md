# Code Review: notifier/cron/webhook/web-server — 2026-05-20

## Summary

28 findings: 5 critical, 8 high, 11 medium, 4 low.

---

## Critical

### [C1] listenWithBackoff восстанавливает только начальное подключение — не reconnect после разрыва

- Files: `apps/notifier/src/listen.ts:13-38`, `apps/notifier/src/index.ts:36-48`
- Problem: После того как `listenFn()` успешно резолвится (строка 28-30), функция делает `return`. Если LISTEN-соединение умирает после установки (рестарт postgres, idle timeout, сетевой blip) — notifier уходит в тишину без краша и без ошибки в логах.
- Why bad: При 50k пользователях и rolling restarts postgres maintenance-окна гарантируют этот сценарий. Потеря уведомлений не диагностируется: сервис "жив", метрик нет, события тихо теряются. postgres.js v3 не автовосстанавливает `.listen()` подписки — это responsibility вызывающей стороны.
- Fix: `listenWithBackoff` должна быть реструктурирована в вечный цикл, где каждая итерация — это одно lifetime подключения: подключился → слушал → получил disconnect-rejection → retry. Передать `listenFn` как фабрику соединения, вызывать её при каждом reconnect-цикле.
- Evidence: `apps/notifier/src/listen.ts:28-30` — `onConnected?.(); return;` — после этого никакого reconnect-цикла нет.

### [C2] Блокирующий await sleep(60_000) внутри LISTEN-обработчика блокирует всю очередь

- Files: `apps/notifier/src/process-event.ts:123`
- Problem: При HTTP 429 от Telegram обработчик выполняет `await sleep(60_000)` внутри синхронного вызова, который стоит в очереди NOTIFY-событий. postgres.js вызывает handler последовательно для одного соединения.
- Why bad: Одна rate-limit ошибка (один пользователь) останавливает обработку всех входящих уведомлений на 60 секунд. При 50k пользователей с активной нагрузкой Postgres NOTIFY queue может переполниться (лимит `pg_notify` — накопление в `pg_stat_activity`). Все pending-уведомления за это время теряются.
- Fix: Убрать sleep из обработчика. 429-события класть в отдельную retry-очередь (in-memory или в `notification_log` со статусом `pending_retry`) и обрабатывать с backoff в отдельном worker-цикле.
- Evidence: `apps/notifier/src/process-event.ts:120-142` — `await sleep(60_000)` без non-blocking механизма.

### [C3] notification_log остаётся со статусом 'sent' после 403 bot_blocked

- Files: `apps/notifier/src/db.ts:41-47`, `apps/notifier/src/process-event.ts:113-118`
- Problem: `tryLogNotification` записывает `status='sent'` при INSERT. При HTTP 403 код вызывает `db.markNotifyDisabled(user_id)` и возвращается — но никогда не вызывает `db.updateNotificationStatus(key, 'failed')`.
- Why bad: Уведомление не было доставлено, но в `notification_log` числится как `'sent'`. Логика повторной отправки, аудит доставляемости и admin-отчёты получат ложные данные. Нарушает контракт интерфейса `NotifStatus`.
- Fix: После `db.markNotifyDisabled(user_id)` добавить `await db.updateNotificationStatus(key, 'failed')`.
- Evidence: `apps/notifier/src/process-event.ts:113-118` — `return` без updateNotificationStatus; сравни с путём 5xx (строка 146).

### [C4] Cron не персистирует "выполнено сегодня" — повторный запуск котейнера дублирует задачи

- Files: `apps/cron/src/index.ts:82-106`
- Problem: Задачи с hour-gate (`if (getUTCHours() !== X) return`) запускаются сразу при старте контейнера в 03:15 UTC и снова через `setInterval(ONE_HOUR)` в 04:15. `withLock` (pg_try_advisory_xact_lock, transaction-scoped) блокирует только одновременные запуски, но не повторные в том же UTC-окне.
- Why bad: Рестарт cron в нужный час (деплой, crash-loop, rolling update) дублирует: резервную копию, base-backup, restore-test, expand-templates. Duplicate backup — потеря disk space и неверная логика архивации. Для `expand_templates` — потенциальные дубликаты поездок (хотя защита через `WHERE NOT EXISTS`). Реальный сценарий: rolling deploy во время backup-window.
- Fix: После каждого успешного выполнения hour/day-gated задачи записывать timestamp в отдельную строку `cron_state` таблицы или key-value в `idempotency_keys`. При следующем вызове проверять не только UTCHour, но и "не выполнялась ли за последние N часов".
- Evidence: `apps/cron/src/index.ts:82-88` — `if (new Date().getUTCHours() !== 3) return` без memory о последнем запуске.

### [C5] Webhook-обработчики UPDATE users без SET LOCAL ROLE — RLS молча блокирует

- Files: `apps/webhook/src/handlers/message.ts:29`, `apps/webhook/src/handlers/my-chat-member.ts:12`
- Problem: Оба обработчика выполняют `sql\`UPDATE users SET notify_disabled = …\`` напрямую без `SET LOCAL ROLE poputchiki_service`. Notifier решил ту же задачу через `db.ts:11` и `db.ts:31`, добавив эскалацию роли. Webhook использует тот же `postgres(DATABASE_URL)` pool с ролью `poputchiki_app`.
- Why bad: Если RLS на таблице `users` разрешает UPDATE только для `poputchiki_service` (политика `users_service_update`), то эти вызовы тихо ноупают (RLS возвращает 0 строк). Пользователь разблокирует бота → webhook получает `/start` → `notify_disabled` остаётся `true` → уведомления не возобновляются. Критическая регрессия UX.
- Fix: Обернуть оба UPDATE в транзакцию с `SET LOCAL ROLE poputchiki_service` — аналогично `notifier/src/db.ts:10-23`.
- Evidence: Сравни `apps/notifier/src/db.ts:10-13` с `apps/webhook/src/handlers/message.ts:27-31`.

---

## High

### [H1] Нет graceful shutdown ни в одном сервисе

- Files: `apps/notifier/src/index.ts`, `apps/cron/src/index.ts`, `apps/webhook/src/index.ts`
- Problem: Ни один сервис не регистрирует обработчики `SIGTERM`/`SIGINT`. Docker stop по умолчанию — SIGTERM, затем через 10с SIGKILL.
- Why bad: Notifier: in-flight Telegram POST обрывается; in-memory dedup cache (Map) теряется, следующий сигнал-дубликат пройдёт. Cron: оборванная транзакция (advisory lock auto-release, но audit_log запись может остаться частичной). Webhook: незакрытый Bun.serve — open sockets висят. Sql-пулы не завершают pending queries корректно.
- Fix: Добавить в каждый сервис:
  ```typescript
  const shutdown = async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  ```
  Для webhook добавить `server.stop()` перед `sql.end()`.
- Evidence: Все три `index.ts` — нет ни одного `process.on("SIGTERM", ...)`.

### [H2] my_chat_member не обрабатывает разблокировку бота

- Files: `apps/webhook/src/handlers/my-chat-member.ts:8`
- Problem: Обработчик реагирует только на `status === "kicked"`. Telegram отправляет `my_chat_member` event и при обратном переходе (пользователь разблокирует бот → `status` становится `"member"`). Этот случай не обрабатывается.
- Why bad: `notify_disabled` очищается только через `/start` (`message.ts:29`). Если пользователь разблокировал через настройки без нажатия `/start` — уведомления не возобновятся. Реальный UX-сценарий: ребёнок случайно блокирует, родитель разблокирует через настройки без /start.
- Fix: Добавить ветку:
  ```typescript
  if (event.new_chat_member.status === "member" && event.chat.type === "private") {
    await sql`UPDATE users SET notify_disabled = false WHERE tg_id = ${event.chat.id}`;
  }
  ```
- Evidence: `apps/webhook/src/handlers/my-chat-member.ts:8` — только `!== "kicked"` branch.

### [H3] O(n) итерация по кешу при каждом событии — нет приемлемого TTL eviction

- Files: `apps/notifier/src/dedup.ts:14-24`, `apps/webhook/src/lib/lru-dedup.ts:9-13`
- Problem: `checkAndSet` итерирует всю Map на каждый вызов (`for (const [k, expiresAt] of cache)`). `LruDedup.has()` аналогично. При window 5 минут и 50k активных пользователей cache может содержать десятки тысяч записей.
- Why bad: O(n) на hot path. Notifier обрабатывает каждое NOTIFY синхронно; при 50k пользователей каждое уведомление сканирует весь кеш. При пиковой нагрузке это создаёт latency spike в единственном потоке обработки.
- Fix: Для dedup-кеша использовать TTL-based eviction через setInterval вместо on-access scan. Или заменить на структуру с O(1) lookup + отдельный cleanup интервал раз в минуту.
- Evidence: `apps/notifier/src/dedup.ts:15-17` — `for (const [k, expiresAt] of cache)` внутри вызова из hot path.

### [H4] Нет timeout на fetch-запросы к Telegram API и к internal API

- Files: `apps/notifier/src/process-event.ts:101`, `apps/webhook/src/handlers/callback-query.ts:43`, `apps/webhook/src/handlers/message.ts:39`
- Problem: Ни один `fetch()` вызов к Telegram Bot API и к internal endpoint не использует `AbortController` с timeout.
- Why bad: Telegram рассчитывает ответ webhook за ≤60 секунд. Если internal API завис → callback_query handler висит → Telegram получает таймаут → ретраит update → повторная обработка. Для notifier: зависший fetch блокирует всю NOTIFY-очередь (см. C2).
- Fix: Оборачивать fetch в AbortController:
  ```typescript
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 10_000);
  const resp = await fetchFn(url, { ..., signal: ac.signal });
  ```
- Evidence: `apps/webhook/src/handlers/callback-query.ts:41-53` — нет signal, нет timeout.

### [H5] Circuit breaker half-open пропускает неограниченный трафик

- Files: `apps/notifier/src/circuit-breaker.ts:20-29`
- Problem: После `openWindowMs` (30s) state переходит в `half-open` через getter `currentState`. Метод `isOpen()` вернёт `false` — весь накопленный трафик хлынет к Telegram одновременно.
- Why bad: При переполнении очереди за 30s open-window и 50k пользователей — одномоментный spike запросов к Telegram API почти гарантирует следующий 429, переводя CB обратно в open. Стандартный паттерн позволяет только 1 probe-запрос в half-open.
- Fix: Добавить счётчик probe-запросов в `half-open` состоянии, ограничить их числом (обычно 1). После успеха — close; после fail — open с reset timer.
- Evidence: `apps/notifier/src/circuit-breaker.ts:27` — `isOpen()` возвращает `false` для `half-open`; нет ограничений.

### [H6] Нет rate-limit и валидации payload на webhook endpoint

- Files: `apps/webhook/src/app.ts:27`
- Problem: `c.req.json<TelegramUpdate>()` — TypeScript cast, не runtime validation. Нет rate-limit на `/webhook/tg`.
- Why bad: Злоумышленник, знающий webhook URL (публичный endpoint), может отправить malformed JSON → `c.req.json()` бросает exception → необработанный 500. Или специально сформированный payload с `update_id = Number.MAX_SAFE_INTEGER` → poisoning dedup LRU. HMAC-защита через `X-Telegram-Bot-Api-Secret-Token` есть, но token может утечь или быть подобран.
- Fix: Добавить runtime schema validation (например через zod) на `TelegramUpdate` перед обработкой. Вынести валидацию до `dedup.has()`.
- Evidence: `apps/webhook/src/app.ts:27` — `await c.req.json<TelegramUpdate>()` без zod/parse.

### [H7] detectAnomalies запускается без advisory lock — несколько реплик дублируют алерты

- Files: `apps/cron/src/index.ts:133-135, 149-155`, `apps/cron/src/anomaly-detect.ts`
- Problem: `detectAnomalies` не использует `withLock`, в отличие от всех остальных задач cron. При N репликах cron — N алертов в Telegram.
- Why bad: Если cron масштабируется горизонтально или при rolling deploy, admin получает дублированные алерты. Даже без масштабирования: при рестарте контейнера в час запуска — 2 алерта подряд (startup run + interval run). Обесценивает мониторинг.
- Fix: Обернуть `detectAnomalies` в `withLock(sql, LOCK_ANOMALY_DETECT, ...)`. Добавить константу `LOCK_ANOMALY_DETECT = 300001` в отдельный namespace.
- Evidence: `apps/cron/src/anomaly-detect.ts:18` — нет `pg_try_advisory_lock`; все остальные задачи (`finalize-rides.ts:12`, `cleanup.ts:22`, etc.) используют `withLock`.

### [H8] buildDsn дублируется между сервисами — три разных способа сборки DSN

- Files: `apps/notifier/src/db.ts:59-65`, `apps/cron/src/index.ts:17-18`, `apps/webhook/src/index.ts:5`
- Problem: Notifier — `buildDsn()` с fallback-цепочкой из 7 env-переменных. Cron — просто `process.env.DATABASE_URL`. Webhook — через `parseWebhookEnv` из shared. Три несовместимые стратегии.
- Why bad: При смене имени env-переменной нужно обновлять все три места. Локальный dev DSN из `POSTGRES_USER/PASSWORD/HOST/PORT/DB` работает только в notifier. Если cron/webhook деплоятся без `DATABASE_URL` — падают с неясным сообщением.
- Fix: Вынести `buildDsn()` в `packages/shared/src/env.ts` (он там уже есть для webhook через `parseWebhookEnv`) и импортировать во все 3 сервиса.
- Evidence: Три разных подхода — `db.ts:59`, `cron/index.ts:18`, `webhook/index.ts:5-6`.

---

## Medium

### [M1] N+1 запросы: enqueueNotification в циклах без batching

- Files: `apps/cron/src/confirm-participation-push.ts:28-39`, `apps/cron/src/finalize-rides.ts:40-46`
- Problem: `for (const row of rows)` с `await enqueueNotification(tx, ...)` и `await tx\`UPDATE ride_participation SET notified_at\`` — по 2 SQL на каждую строку.
- Why bad: При 1000 завершённых поездок в одном batch (что реально при 50k пользователей за сутки) — 2000 sequential queries внутри одной транзакции. Транзакция держит advisory lock на всё время выполнения, блокируя параллельные запуски.
- Fix: Заменить на batch INSERT для уведомлений и одиночный UPDATE с `WHERE ... IN (...)`. Пример: сначала один массовый `enqueueNotification` batch, затем `UPDATE ride_participation SET notified_at = now() WHERE (ride_id, passenger_id) IN (VALUES ...)`.
- Evidence: `apps/cron/src/confirm-participation-push.ts:28-39`.

### [M2] Hour-gated задачи не компенсируют пропущенное окно

- Files: `apps/cron/src/index.ts:45, 53, 68, 76, 84, 93, 102`
- Problem: `if (new Date().getUTCHours() !== X) return` — если cron был down в час X (и C4 не покрывает этот case: другой час) — задача пропускается навсегда до следующего дня/недели.
- Why bad: Потеря ежедневного backup (if cron was down at 3:00 UTC, next backup — через 24h). Потеря `expand_templates` на день — пользователи не видят поездок по шаблонам. Особенно критично для `runWeeklyBaseBackup` — пропуск = неделя без base backup.
- Fix: Pair с M1-стилевым "last_run" из idempotency_keys: дополнительно проверять "выполнялась ли задача сегодня/на этой неделе" и если нет — запускать вне окна.
- Evidence: `apps/cron/src/index.ts:84-88`.

### [M3] Postgres pool size не ограничен — риск исчерпания max_connections

- Files: `apps/notifier/src/index.ts:11,35`, `apps/cron/src/index.ts:20`, `apps/webhook/src/index.ts:6`
- Problem: `postgres(dsn)` без `{ max: N }`. Default postgres.js — 10 connections per pool. Каждый сервис создаёт pool при старте. Notifier создаёт два (строки 11 и 35).
- Why bad: При 2 репликах каждого из 3 сервисов + api (отдельный pool) — суммарно может быть 60-80 connections. PostgreSQL default `max_connections=100`. Пиковые cron-задачи создают дополнительные `sql.reserve()` запросы. Exhaust — все сервисы падают с `connection refused`.
- Fix: Явно устанавливать `max` в соответствии с задокументированным бюджетом: notifier `max: 2` (listen pool `max: 1` уже установлен), cron `max: 3`, webhook `max: 5`.
- Evidence: `apps/notifier/src/index.ts:11` — `postgres(dsn)` без max; `index.ts:35` — `postgres(dsn, { max: 1 })` (уже правильно для listen).

### [M4] anomaly-detect не дедуплицирует алерты в течение суток

- Files: `apps/cron/src/anomaly-detect.ts:29-43`
- Problem: Функция запускается каждый час. Если порог превышен — алерт отправляется каждый час до следующего дня.
- Why bad: При аномалии в 12:00 UTC до 24:00 admin получает 12 одинаковых сообщений. Обесценивание сигнала, "alert fatigue".
- Fix: После первой успешной отправки алерта записывать timestamp в `idempotency_keys` с TTL 24h и пропускать повторные отправки.
- Evidence: `apps/cron/src/anomaly-detect.ts:29` — нет check "уже алертил сегодня".

### [M5] Callback-query editMessageText теряет parse_mode

- Files: `apps/webhook/src/handlers/callback-query.ts:107-127`
- Problem: `editMessageText` запрос не передаёт `parse_mode`. Оригинальное сообщение было отправлено с `parse_mode: "HTML"` (notifier/process-event.ts:96).
- Why bad: Если оригинальный текст содержит HTML-теги (`<b>`, `<code>`), после редактирования сообщения они отобразятся как plain text или вызовут ошибку Telegram (если теги не закрыты). Сейчас `format.ts` не использует HTML, но это fragile coupling.
- Fix: Передавать `parse_mode: "HTML"` в `editMessageText` тело запроса.
- Evidence: `apps/webhook/src/handlers/callback-query.ts:117-124` — нет `parse_mode` в body.

### [M6] Логирование не через pino — нет structured levels, correlation ID, transports

- Files: Все сервисы — `apps/notifier/src/index.ts:17-20`, `apps/cron/src/index.ts:27`, etc.
- Problem: Логирование реализовано через `console.log(JSON.stringify({...}))` везде. Нет pino, нет log level, нет correlation/request ID, нет транспорта для агрегации.
- Why bad: Нет log levels (нельзя отключить verbose в prod). Нет `trace_id` для сквозного трейсинга через notifier → webhook → api. В Kubernetes log-aggregation без structured levels невозможна фильтрация. Контрастирует с заявленным стеком (pino).
- Fix: Заменить на `pino` с `{ level: process.env.LOG_LEVEL ?? 'info' }`. Вынести `createLogger()` в `packages/shared`.
- Evidence: `apps/notifier/src/index.ts:17-20` — custom log() функция вместо pino.

### [M7] Cron не завершает setInterval при graceful shutdown — процесс не выходит

- Files: `apps/cron/src/index.ts:136-155`
- Problem: Все `setInterval` хранятся без handle (`setInterval(runCleanup, FIVE_MIN)` без `const id = setInterval...`).
- Why bad: Даже если добавить SIGTERM handler (H1), `sql.end()` может зависнуть: event loop не пустой, т.к. `setInterval` держит его открытым. `process.exit(0)` вынужден вызываться принудительно, что может оборвать in-flight транзакции.
- Fix: Хранить все interval IDs и вызывать `clearInterval(id)` в SIGTERM handler перед `sql.end()`.
- Evidence: `apps/cron/src/index.ts:136-155` — голые `setInterval(...)` без capture.

### [M8] pg_notify payload не проверяется на размер — риск silent drop при >8KB

- Files: `apps/notifier/src/process-event.ts:39-40`
- Problem: PostgreSQL NOTIFY payload limit — 8000 bytes. Если `NotifyPayload` содержит длинные строки (driver_name, passenger_name через PII-шифрование? нет, но comment в поездке), payload может превысить лимит — pg тихо обрежет или бросит error на стороне отправителя.
- Why bad: При текущем payload (несколько UUID + имена) риск низкий, но архитектурно нет защиты. Если в будущем в payload добавят comment или full_name из зашифрованного поля — проблема появится внезапно.
- Fix: В `enqueueNotification` (shared) добавить `assert(JSON.stringify(payload).length < 7500, ...)` или логировать warning при приближении к лимиту.
- Evidence: `apps/notifier/src/types.ts:11-23` — `NotifyPayload` с `[key: string]: unknown` — открытый интерфейс.

### [M9] anomaly-detect отправляет HTML с BOT_TOKEN в URL без sanitization

- Files: `apps/cron/src/anomaly-detect.ts:37-43`
- Problem: `sendAdminAlert` формирует HTML-сообщение с числовым значением `newUsers`. Сейчас безопасно, но `parse_mode: "HTML"` + потенциальная интерполяция user-controlled данных — injection риск.
- Why bad: Если в будущем alert будет включать данные из `users` таблицы (username, первые символы имени для диагностики) — это прямой XSS/HTML-injection в Telegram.
- Fix: Использовать `parse_mode: "MarkdownV2"` для шаблонных сообщений без user data, или явно эскейпировать все интерполируемые значения.
- Evidence: `apps/cron/src/anomaly-detect.ts:38` — `parse_mode: "HTML"` в шаблоне с interpolation.

### [M10] Webhook legacy path /tg/webhook без документации к удалению

- Files: `apps/webhook/src/app.ts:60`
- Problem: `app.post("/tg/webhook", webhookSecret(webhookSecretToken), handleUpdate)` помечен как "Legacy path kept for backward compatibility" — но нет issue/task/TODO с датой удаления.
- Why bad: Legacy path остаётся вечно, увеличивает attack surface (два endpoint вместо одного). Неясно, используется ли он ещё в production.
- Fix: Добавить `// TODO [TASK-XXX]: remove after 2026-07-01 — confirm no traffic in metrics` или сразу убрать если не нужен.
- Evidence: `apps/webhook/src/app.ts:59-60`.

### [M11] expand_templates запускается в одной транзакции с N INSERT внутри withLock

- Files: `apps/cron/src/expand-templates.ts:59-73`
- Problem: Для каждого шаблона × день выполняется отдельный `await tx\`INSERT INTO rides …\`` в цикле внутри одной длинной транзакции с advisory lock.
- Why bad: При 100 шаблонах × 14 дней = 1400 SQL-запросов в одной транзакции. Транзакция держит advisory lock и блокирует строки в `rides` всё это время. При сбое на запросе №1399 — откат всей работы. Долгая транзакция создаёт bloat.
- Fix: Разбить на batched `INSERT INTO rides ... SELECT ... FROM unnest($1, $2, ...) AS data(...)` с bulk-значениями, один INSERT вместо N.
- Evidence: `apps/cron/src/expand-templates.ts:44-74` — `for` loop с `await tx` внутри.

---

## Low

### [L1] Caddy Dockerfile содержит неиспользуемый wget

- Files: `apps/web-server/Dockerfile:23`
- Problem: `RUN apk add --no-cache wget` — wget ни разу не используется ни в Caddyfile, ни в Dockerfile.
- Why bad: Увеличивает attack surface (лишний инструмент в контейнере). Раньше использовался для healthcheck, сейчас заменён на `/health` endpoint.
- Fix: Удалить строку.
- Evidence: `apps/web-server/Dockerfile:23` — `wget` установлен; `grep -r "wget" apps/web-server/` — 0 использований.

### [L2] Caddy отдаёт HSTS без TLS — заголовок бесполезен

- Files: `apps/web-server/Caddyfile:13`
- Problem: `Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"` отдаётся на порту :80 (HTTP). `auto_https off` в блоке global.
- Why bad: HSTS имеет смысл только на HTTPS. Браузер игнорирует HSTS от HTTP-ответов. Этот Caddy стоит за Traefik (который делает TLS), поэтому между контейнерами plain HTTP — но клиент никогда не видит этот заголовок напрямую. Технически безвредно, но вводит в заблуждение при чтении конфига.
- Fix: Оставить HSTS, но добавить комментарий: `# Traefik terminates TLS — header forwarded to client`. Или убедиться, что Traefik правильно forward-ит headers.
- Evidence: `apps/web-server/Caddyfile:3-4, 13`.

### [L3] LruDedup.has() не вызывает cleanExpired атомарно с проверкой

- Files: `apps/webhook/src/lib/lru-dedup.ts:9-14`
- Problem: `has()` итерирует для cleanup и проверяет key, но `add()` вызывается отдельно. Нет гарантии что между `has()` и `add()` не придёт concurrent `has()` для того же key. Bun — single-threaded, поэтому race condition невозможен, но паттерн не самодокументируется.
- Why bad: Потенциальная confusion при portability. Minor.
- Fix: Объединить `has()` и `add()` в один метод `tryAdd(): boolean` — возвращает `true` если добавлено как новое, `false` если уже есть. Явная атомарность.
- Evidence: `apps/webhook/src/app.ts:28-29` — отдельные `dedup.has()` и `dedup.add()`.

### [L4] Нет health endpoint в notifier и cron

- Files: `apps/notifier/src/index.ts`, `apps/cron/src/index.ts`
- Problem: Только webhook имеет `/health`. Notifier и cron не экспортируют HTTP-endpoint.
- Why bad: Docker Compose и Traefik не могут настроить healthcheck через HTTP. Контейнер считается healthy сразу после старта, даже если postgres connection не установлен. Мониторинг слепой.
- Fix: Для notifier — минимальный Bun.serve на отдельном порту с `/health` endpoint, который проверяет что LISTEN connection active. Для cron — `/health` что sql доступен.
- Evidence: `apps/webhook/src/app.ts:54` — есть `/health`; notifier и cron — нет.

---

## Notes

- `apps/notifier/src/listen.ts` — функция `listenWithBackoff` написана чисто и тестируема; проблема (C1) архитектурная, не в качестве кода.
- `apps/cron/src/lib/with-lock.ts` — хорошая абстракция с понятным интерфейсом; все cleanup задачи корректно используют advisory lock. Исключение — detectAnomalies (H7).
- `apps/webhook/src/middleware/webhook-secret.ts` — корректное timing-safe сравнение, правильная проверка длины перед `timingSafeEqual`.
- `apps/notifier/src/process-event.ts` — хорошая sanitizeErr функция; BOT_TOKEN никогда не попадёт в логи.
- Тесты хорошо покрывают happy path и ряд edge cases (circuit breaker, dedup, 429 retry). Основные пробелы: нет теста для C1 (reconnect после drop), нет теста для C4 (double-run при рестарте в нужный час).
