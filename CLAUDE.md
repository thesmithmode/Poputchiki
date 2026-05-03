# Правила проекта Poputchiki

## Что это

Poputchiki — Telegram MiniApp для попутчиков ЖК Царёво. Стек: TypeScript + Hono + Bun (backend), Vite + React (SPA), self-hosted PostgreSQL 16 в Docker (НЕ Supabase, НЕ Neon, НЕ managed), Docker Compose микросервисы (`api`, `notifier`, `cron`, `webhook`, `web-server`, `postgres`, `nominatim`), Traefik + Let's Encrypt на личном сервере заказчика.
Фаза: full-MVP с автономным go-to-prod. `phase=mvp` (TASK-001..114) → `phase=prod-deploy` (TASK-115..125) → пайплайн деплоя.
RLS identity: НЕТ Supabase `auth.uid()`/`auth.jwt()`. GUC `app.current_user_id`/`app.current_user_tg_id`/`app.current_user_role`, выставляются `apps/api` через `set_config(..., true)` в начале каждой транзакции (SPEC §3.4).
Документы (любое арх/прод решение → сначала docs, потом код):
- `docs/PRD-Poputchiki-v0.1.md` — продуктовые требования (v0.4)
- `docs/SPEC-Architecture-v0.1.md` — архитектура + схема БД (v0.5)
- `docs/OPEN-QUESTIONS-v0.1.md` — слепые зоны и решения (v0.4)
- `docs/AUTOMATION.md` — стратегия автономной разработки

## Как работаем

Без bash-скрипта. Антон запускает Claude Code в этой папке + говорит «продолжай» (или `/loop` skill для self-pacing). Агент следует процессу ниже.
Очередь — `tasks.json` (атомарные, статусы pending/done/blocked). Журнал — `progress.txt`. Между сессиями — `.memory/` (claude-memory-compiler).
Тяжёлая сессия (≥50 задач выполнено / контекст >70%) → Антон делает `/clear`, новая сессия. Состояние восстанавливается из `tasks.json` + `progress.txt` + `.memory/` + этого CLAUDE.md.

## Процесс одной итерации (обязательный)

13 шагов: Pre-flight → Snapshot SHA → Выбор задачи → TDD → Quality gates (CI only) → Coverage gate (95%) → Коммит → tasks.json+progress.txt → Push → Маркер → TG-нотификация → Code review на вехах → Следующая.
Полные команды и детали → `.claude/ITERATION-PROCESS.md`. Читать в начале каждой итерации.

## Жёсткие правила

- TDD строго: тесты ПЕРЕД кодом, всегда
- Одна задача за раз: никаких бонусных правок, занялся → закончи или верни в pending
- Не push в `main` без явного приказа Антона. Hook `PreToolUse(Bash:git push origin main)` блокирует
- Не писать секреты в код/коммит/чат/логи: только `process.env.X` из `.env`
- Phase порядок: сначала все `phase=mvp`, потом `phase=prod-deploy`. Внутри фазы — по dependencies + priority. Из `prod-deploy` бери только когда ВСЕ `mvp` зелёные
- Production deploy в рамках `phase=prod-deploy` (TASK-115..125). Любой rollback / `docker compose down` на production — только через `scripts/rollback.sh` либо ручной command от Антона
- Никаких внешних managed: Supabase / Neon / Vercel / Cloudflare Pages / Fly.io / PostHog Cloud в коде запрещено. Задача требует external service → BLOCKED + согласование
- Threat model: каждый юзер = потенциальный взломщик. Deny-by-default везде (RLS, auth, валидация)
- Bun не Node: `bun run`, `bun test`, `bun add`, `bun install`
- Самоостанов: 5 итераций подряд BLOCKED → стоп, доложи Антону

## .gitignore — ТОЛЬКО для секретов

Разрешено:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `secrets/`
- runtime data volumes внутри проекта (например `.docker-data/`) — исключение, договорились 2026-05-01
Всё остальное коммитится — `node_modules/`, артефакты сборки, логи, кэш. Репо приватный, история нужна полная.
Инструмент сгенерировал широкий `.gitignore` (Next.js, create-vite) → удалить, оставить только наш минимальный.

## Секреты

Два места:
1. GitHub Secrets — `gh secret set <NAME> -R thesmithmode/Poputchiki` (значение через stdin)
2. Локальный `.env` — для разработки и Ralph-цикла. В `.gitignore`, не пушится. `.env.example` — шаблон в репо
Текущие секреты: `BOT_TOKEN`, `ADMIN_TG_ID`, `ADMIN_TG_CHAT_ID`, `POSTGRES_*`, `JWT_SECRET`. Variable: `DOMAIN`.
Никогда не выводить значения секретов в чат/stdout/логи/коммит. Засветил → `gh secret set` перегенерированное + revoke оригинала (bot tokens — `/revoke` в @BotFather).

## Эталоны и материалы

- Telegram Mini App auth: `C:\Soft\Projects\Telegram-export-clean\src\main\java\com\tcleaner\dashboard\auth\telegram\` — HMAC + nonce + identity-guard cookie. Портируем на Hono
- Шаблон Ralph-цикла (исторический): `saas/saas-project-ralph/` — больше не используем как is, но стиль атомарных задач + progress.txt оттуда
- Wishlist улучшений Ralph: `saas/saas-project-ralph/Доработать_скрипт.md` — реализуем по необходимости
- Стратегия автоматизации: `docs/AUTOMATION.md` — обоснование «без скрипта»

## Стек напоминание

- Backend: TypeScript + Hono + Bun
- Frontend: TypeScript + Vite + React (SPA), отдаётся Caddy за Traefik
- БД: self-hosted PostgreSQL 16 в Docker (`postgres:16-alpine`). НЕ Supabase, НЕ Neon, НЕ managed
- Auth: собственный JWT (HS256, `JWT_SECRET` из env) после HMAC-проверки Telegram initData. Refresh-tokens с ротацией через таблицу `revoked_tokens`
- Realtime: SSE через Hono + Postgres `LISTEN/NOTIFY`. Fallback на 30s polling
- Карта: Leaflet + OpenStreetMap (без API-key)
- Geocoding: self-hosted Nominatim (`mediagis/nominatim`) контейнер с импортом региона Татарстан
- PII: pgcrypto `pgp_sym_encrypt` для phone/apt_number, ключ `PGCRYPTO_KEY` из env
- Тесты: Vitest (unit, integration, contract, security), Playwright (E2E), StrykerJS (mutation, nightly), OWASP ZAP baseline (nightly)
- Lint/format: Biome
- Workspace: Bun workspaces (monorepo: `apps/api`, `apps/notifier`, `apps/cron`, `apps/webhook`, `apps/web-server`, `web`, `packages/shared`)
- Docker: `infra/docker-compose.dev.yml` (local: postgres + nominatim), `infra/docker-compose.prod.yml` (prod: api+notifier+cron+webhook+web-server+postgres+nominatim, опц. observability stack)
- Деплой: GHA workflow `deploy.yml` → build images в GHCR → SSH на сервер → `scripts/deploy.sh ${SHA}` → backup pre-deploy → migrate → docker compose up -d → smoke /health → rollback при fail. Domain: `poputchiki.searchingforgamesforever.online` (поддомены `app.`, `api.`, `webhook.`)
- Observability: pino logs → файл с rotation; опц. Prometheus + Grafana + Uptime Kuma compose; Sentry self-hosted (план A) либо `error_log` table + admin TG-alert (план B)
