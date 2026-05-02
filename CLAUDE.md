# Правила проекта Poputchiki

## Что это

Poputchiki — Telegram MiniApp для попутчиков ЖК Царёво. Стек: TypeScript + Hono + Bun (backend), Vite + React (SPA), **self-hosted PostgreSQL 16 в Docker** (НЕ Supabase, НЕ Neon, НЕ managed), Docker Compose микросервисы (`api`, `notifier`, `cron`, `webhook`, `web-server`, `postgres`, `nominatim`), Traefik + Let's Encrypt на личном сервере заказчика.

**Фаза**: full-MVP **с автономным go-to-prod**. После задач `phase=mvp` (TASK-001..114) → задачи `phase=prod-deploy` (TASK-115..125) → пайплайн деплоя на сервер.

**RLS identity**: НЕТ Supabase-функций `auth.uid()`/`auth.jwt()`. Используем GUC `app.current_user_id`/`app.current_user_tg_id`/`app.current_user_role`, выставляются `apps/api` через `set_config(..., true)` в начале каждой транзакции (см. SPEC §3.4).

Полный продукт описан в:
- `docs/PRD-Poputchiki-v0.1.md` — продуктовые требования (v0.4)
- `docs/SPEC-Architecture-v0.1.md` — архитектура и схема БД (v0.5)
- `docs/OPEN-QUESTIONS-v0.1.md` — слепые зоны и решения (v0.4)
- `docs/AUTOMATION.md` — стратегия автономной разработки

Любые архитектурные/продуктовые решения сначала обновляют эти документы, потом код.

---

## Как работаем

**Без bash-скрипта**. Антон запускает Claude Code в этой папке и говорит «продолжай» (или использует `/loop` skill для self-pacing). Агент следует процессу ниже.

Очередь работы — `tasks.json` (атомарные задачи, статусы pending/done/blocked). Журнал — `progress.txt`. Прогресс между сессиями сохраняется через `.memory/` (claude-memory-compiler).

**Когда сессия становится тяжёлой** (≥50 задач выполнено / контекст > 70%) — Антон делает `/clear`, начинает новую сессию. Состояние полностью восстанавливается из `tasks.json` + `progress.txt` + `.memory/` + этого CLAUDE.md.

---

## Процесс одной итерации (обязательный)

### 1. Pre-flight (перед каждой задачей)

Запусти Bash:
```bash
# Окружение
command -v bun >/dev/null  || echo "❌ bun не установлен. Антон ставит: irm bun.sh/install.ps1 | iex (PowerShell) или npm i -g bun"
command -v jq >/dev/null   || echo "⚠ jq не установлен (нужен для парсинга tasks.json в shell). Антон ставит: scoop install jq"
# Файлы
[[ -f .env ]]              || echo "❌ нет .env — скопируй .env.example и заполни"
[[ -f tasks.json ]]        || echo "❌ нет tasks.json"
# Git
git diff --quiet           || echo "⚠ незакомиченные изменения — закоммить или git stash перед стартом"
[[ "$(git branch --show-current)" != "main" ]] || echo "❌ ты в main, перейди на dev"
# Если уже инициализирован monorepo
[[ -f package.json ]] && bun run lint && bun run typecheck
```

Любая ошибка ❌ → остановись, доложи Антону, не выбирай задачу.

### 2. Snapshot SHA
Сохрани `SNAPSHOT=$(git rev-parse HEAD)` — пригодится для отката если задача провалится.

### 3. Выбор задачи
Из `tasks.json`:
- статус `pending`,
- все `dependencies` имеют статус `done`,
- максимальный `priority` (`critical` > `high` > `medium` > `low`),
- если несколько подходят — первая по списку,
- НЕ бери задачи с `phase: post-mvp-deploy` пока Антон не разрешит.

**Одна задача за итерацию.** Никаких бонусных рефакторов.

Запиши TodoWrite с шагами этой задачи (acceptance_criteria → todos).

### 4. TDD строго (skill `superpowers:test-driven-development`)
- **RED**: сначала пишешь тест-файл (он упадёт при запуске в CI).
- **GREEN**: минимальная реализация, чтобы тесты прошли в CI.
- **REFACTOR**: убери дублирование, чисти.

Каждый новый код-файл → соответствующий тест-файл.

### 5. Quality gates (ТОЛЬКО в CI — никогда локально)

**ВАЖНО: Никаких локальных запусков.** Никогда не запускай `bun run test`, `docker compose up`, `bun run lint`, `bun run typecheck` и прочее локально. Единственное исключение — `git` команды и чтение/запись файлов.

Работа здесь = **писать код + тесты + конфиги → коммит → push**. Всё остальное делает GitHub Actions CI.

Верификация качества:
- Lint, typecheck, тесты, coverage, Docker-интеграция — только в CI (`.github/workflows/ci.yml`).
- После push в `dev` → смотреть статус CI через `gh run list` или GitHub UI.
- Если CI красный → читать логи (`gh run view`), фиксить код, снова push.
- НИКОГДА не запускать Docker, не поднимать контейнеры, не делать `bun test` локально.

### 6. Coverage gate (в CI)
Минимум: 95% lines / 90% branches / 95% functions / 95% statements. Target — 100%.
Coverage проверяется в CI через `vitest --coverage` + `scripts/check-coverage.js`.
Если CI падает по coverage → фиксить тесты/код → push → ждать CI.

### 7. Коммит
```bash
git add -A
git commit -m "<TYPE>: <описание на русском>"
```
Где TYPE: `FEAT|FIX|CHORE|DOCS|REFACTOR|TEST`.

**Без AI-подписи**. Никаких `Co-Authored-By: Claude`, `Generated with Claude Code`, и т.п. Удалить до commit.

**Кириллица**: bash ломает кириллицу → используй PowerShell или here-doc для коммитов с русским текстом.

### 8. Обнови `tasks.json` и `progress.txt`
- В `tasks.json`: смени `status` выбранной задачи на `done`, добавь `completed_at: "YYYY-MM-DDTHH:MM:SSZ"` (UTC).
- В `progress.txt`: добавь запись по формату из шапки файла.

Эти изменения коммитятся отдельным маленьким коммитом или в составе основного коммита задачи.

### 9. Push
```bash
git push origin dev
```

`dev` — autonomous push разрешён. **`main` — никогда без явного приказа Антона**.

### 10. Маркер итерации
- Успех → запиши «Итерация N завершена» в чат + сделай TG-нотификацию (см. п.11).
- BLOCKED → измени `status` задачи в `tasks.json` на `blocked`, добавь блок `BLOCKED:<причина>` в `progress.txt`, скажи Антону что нужно вручную.

### 11. TG-нотификация (опционально)
```bash
./scripts/notify-admin.sh "✓ TASK-XXX done. <краткое описание>"
```
Молча skip если `BOT_TOKEN`/`ADMIN_TG_CHAT_ID` отсутствуют в `.env`.

### 12. Code review после крупных вех

После завершения каждой из следующих вех — **остановись, проведи code review перед следующей задачей**:

| Веха | После какой задачи |
|---|---|
| Infra + DB готовы | TASK-008 (все миграции) |
| Auth полностью готов | TASK-015 (JWT refresh + logout) |
| Core API готов | TASK-038 (все rides/requests endpoints) |
| Frontend skeleton + auth | TASK-016 |
| Full E2E happy path | TASK-060 |
| Security hardening done | TASK-090 |

**Процесс review:**
1. `git diff dev..HEAD` или `git log --oneline` — понять масштаб
2. Применить skill `superpowers:requesting-code-review`
3. Найденные issues → создать задачи с `priority: high` прямо в `tasks.json` (добавить в список перед следующей вехой)
4. Не продолжать пока критические issues не закрыты

Security review (отдельно от code review) встроен в CI через `bun run test:security` и nightly OWASP ZAP (TASK-121).

### 13. Следующая итерация
Если ещё есть pending-задачи с готовыми deps:
- Если Антон сказал «продолжай пока не закончится» / запущен `/loop` → возвращайся к шагу 1.
- Иначе → жди инструкций.

---

## Жёсткие правила

- **TDD строго**: тесты ПЕРЕД кодом, всегда.
- **Одна задача за раз**: никаких бонусных правок, чем-то занялся → закончи или верни в pending.
- **Не push в `main` никогда** без явного приказа Антона. Hook `PreToolUse(Bash:git push origin main)` блокирует.
- **Не пиши секреты в код/коммит/чат/логи**: только `process.env.X` из `.env`.
- **Phase порядок**: сначала все `phase=mvp` задачи, потом `phase=prod-deploy`. Внутри фазы — по dependencies + priority. Из `prod-deploy` задачи бери только когда ВСЕ `mvp` зелёные.
- **Production deploy** разрешён в рамках задач `phase=prod-deploy` (TASK-115..125). Любой rollback / `docker compose down` на production хосте — только через `scripts/rollback.sh` либо ручной command от Антона.
- **Никаких внешних managed сервисов**: Supabase / Neon / Vercel / Cloudflare Pages / Fly.io / PostHog Cloud в коде — запрещено. Если задача требует external service — BLOCKED + согласование с Антоном.
- **Threat model**: каждый юзер — потенциальный взломщик. Deny-by-default везде (RLS, auth, валидация).
- **Bun не Node**: `bun run`, `bun test`, `bun add`, `bun install`.
- **Самоостанов**: 5 итераций подряд BLOCKED → стоп, доложи Антону.

---

## .gitignore — ТОЛЬКО для секретов

`.gitignore` разрешён ТОЛЬКО для:
- `.env`, `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `secrets/`
- runtime data volumes которые внутри проекта (например `.docker-data/`) — это исключение, договорились 2026-05-01

Всё остальное коммитится — `node_modules/`, артефакты сборки, логи, кэш. Репо приватный, история нужна полная.

Если инструмент сгенерировал широкий `.gitignore` (Next.js, create-vite) — удалить и оставить только наш минимальный.

---

## Секреты

В двух местах:
1. **GitHub Secrets** — `gh secret set <NAME> -R thesmithmode/Poputchiki` (значение через stdin).
2. **Локальный `.env`** — для разработки и Ralph-цикла. В `.gitignore`, не пушится. `.env.example` — шаблон в репо.

Текущие секреты: `BOT_TOKEN`, `ADMIN_TG_ID`, `ADMIN_TG_CHAT_ID`, `POSTGRES_*`, `JWT_SECRET`. Variable: `DOMAIN`.

**Никогда не выводи значения секретов в чат / stdout / логи / коммит-сообщения.** Если случайно засветил — `gh secret set` перегенерированное + revoke оригинала (для bot tokens — `/revoke` в @BotFather).

---

## Правила коммитов

**Формат**: `ПРЕФИКС: описание на русском`
- Префикс — английский: `CHORE`, `FIX`, `FEAT`, `DOCS`, `REFACTOR`, `TEST`.
- Описание — русский.
- **Автор**: `thesmithmode <117716736+thesmithmode@users.noreply.github.com>`
- **AI-подписи запрещены** везде: коммиты, PR, release notes, доки.
- Кириллица в commit message → через PowerShell heredoc, не bash (bash ломает encoding).

---

## Эталоны и материалы

- Telegram Mini App auth: `C:\Soft\Projects\Telegram-export-clean\src\main\java\com\tcleaner\dashboard\auth\telegram\` — HMAC + nonce + identity-guard cookie. Портируем на Hono.
- Шаблон Ralph-цикла (исторический): `saas/saas-project-ralph/` — больше не используем как is, но стиль атомарных задач + progress.txt оттуда.
- Wishlist улучшений Ralph: `saas/saas-project-ralph/Доработать_скрипт.md` — много идей, реализуем по необходимости.
- Стратегия автоматизации: `docs/AUTOMATION.md` — обоснование «без скрипта».

---

## Стек напоминание

- **Backend**: TypeScript + Hono + Bun
- **Frontend**: TypeScript + Vite + React (SPA), отдаётся Caddy за Traefik
- **БД**: self-hosted PostgreSQL 16 в Docker (`postgres:16-alpine`). НЕ Supabase, НЕ Neon, НЕ managed
- **Auth**: собственный JWT (HS256, `JWT_SECRET` из env) после HMAC-проверки Telegram initData. Refresh-tokens с ротацией через таблицу `revoked_tokens`
- **Realtime**: SSE через Hono + Postgres `LISTEN/NOTIFY`. Fallback на 30s polling
- **Карта**: Leaflet + OpenStreetMap (без API-key)
- **Geocoding**: self-hosted Nominatim (`mediagis/nominatim`) контейнер с импортом региона Татарстан
- **PII**: pgcrypto `pgp_sym_encrypt` для phone/apt_number, ключ `PGCRYPTO_KEY` из env
- **Тесты**: Vitest (unit, integration, contract, security), Playwright (E2E), StrykerJS (mutation, nightly), OWASP ZAP baseline (nightly)
- **Lint/format**: Biome
- **Workspace**: Bun workspaces (monorepo: `apps/api`, `apps/notifier`, `apps/cron`, `apps/webhook`, `apps/web-server`, `web`, `packages/shared`)
- **Docker**: `infra/docker-compose.dev.yml` (local: postgres + nominatim), `infra/docker-compose.prod.yml` (prod: api+notifier+cron+webhook+web-server+postgres+nominatim, опц. observability stack)
- **Деплой**: GHA workflow `deploy.yml` → build images в GHCR → SSH на сервер → `scripts/deploy.sh ${SHA}` → backup pre-deploy → migrate → docker compose up -d → smoke /health → rollback при fail. Domain: `poputchiki.searchingforgamesforever.online` (поддомены `app.`, `api.`, `webhook.`)
- **Observability**: pino logs → файл с rotation; опц. Prometheus + Grafana + Uptime Kuma compose; Sentry self-hosted (план A) либо `error_log` table + admin TG-alert (план B)
