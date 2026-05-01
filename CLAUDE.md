# Правила проекта Poputchiki

## Что это

Poputchiki — Telegram MiniApp для попутчиков ЖК Царёво. Стек: TypeScript + Hono + Bun (backend), Vite + React (SPA), self-hosted PostgreSQL, Docker, Traefik. Деплой откладывается — текущая фаза **code-only local**.

Полный продукт описан в:
- `docs/PRD-Poputchiki-v0.1.md` — продуктовые требования (v0.3)
- `docs/SPEC-Architecture-v0.1.md` — архитектура и схема БД (v0.3)
- `docs/OPEN-QUESTIONS-v0.1.md` — слепые зоны и решения (v0.3)
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
- **RED**: failing tests первым (unit + integration где нужно + e2e где нужно).
- **GREEN**: минимальная реализация, чтобы тесты прошли.
- **REFACTOR**: убери дублирование, чисти.

Каждый новый код-файл → соответствующий тест-файл. Pre-commit hook отвергнет коммит без теста.

### 5. Quality gates (перед коммитом)
Запусти и убедись что зелёное:
- `bun run lint`
- `bun run typecheck`
- `bun run test:unit -- --coverage` (≥90% lines если уже настроено)
- `bun run test:integration` (если задача интеграционная)
- `bun run test:e2e` (если задача затрагивает UI)
- `bun run test:security` (если задача затрагивает auth/RLS/secrets)

Применяй skill `superpowers:verification-before-completion` перед маркировкой задачи готовой.

Если какой-то скрипт ещё не настроен (нулевая фаза проекта) — пропусти, но добавь `TODO: настроить X` в `progress.txt`.

### 6. Coverage gate
Если `coverage/coverage-summary.json` существует и `lines.pct < 90`:
- Откати коммит: `git reset --hard $SNAPSHOT`
- Попробуй ещё раз с фокусом на покрытие.
- Если 3 попытки не помогли → BLOCKED (см. п.10).

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

### 12. Следующая итерация
Если ещё есть pending-задачи с готовыми deps:
- Если Антон сказал «продолжай пока не закончится» / запущен `/loop` → возвращайся к шагу 1.
- Иначе → жди инструкций.

---

## Жёсткие правила

- **TDD строго**: тесты ПЕРЕД кодом, всегда.
- **Одна задача за раз**: никаких бонусных правок, чем-то занялся → закончи или верни в pending.
- **Не push в `main` никогда** без явного приказа Антона. Hook `PreToolUse(Bash:git push origin main)` блокирует.
- **Не пиши секреты в код/коммит/чат/логи**: только `process.env.X` из `.env`.
- **Не делай deploy-related работу** (Traefik labels на сервере, ssh, prod миграции, GH Actions deploy step) — фаза code-only. Задачи с `phase: post-mvp-deploy` не бери.
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
- **Frontend**: TypeScript + Vite + React (SPA)
- **БД**: self-hosted PostgreSQL 16 в Docker (НЕ Supabase)
- **Auth**: собственный JWT после HMAC-проверки Telegram initData
- **Realtime**: SSE через Hono (НЕ Supabase Realtime)
- **Карта**: Leaflet + OpenStreetMap
- **Тесты**: Vitest (unit, integration), Playwright (E2E)
- **Lint/format**: Biome
- **Workspace**: Bun workspaces (monorepo: apps/api, apps/notifier, apps/cron, web, packages/shared)
- **Docker**: docker-compose.dev.yml для локального Postgres; production манифест — фаза deploy.
- **Деплой** (отложено): домашний сервер + Traefik + Let's Encrypt; домен `poputchiki.searchingforgamesforever.online`.
