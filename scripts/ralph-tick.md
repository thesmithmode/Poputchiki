# Ralph tick — одна итерация автономной разработки Poputchiki

Контекст для тебя: @tasks.json @progress.txt @docs/PRD-Poputchiki-v0.1.md @docs/SPEC-Architecture-v0.1.md @docs/AUTOMATION.md @CLAUDE.md @.env.example

Ты работаешь в проекте **Poputchiki** — Telegram MiniApp для попутчиков ЖК Царёво. Ты внутри Ralph-цикла; снаружи bash-скрипт оборачивает тебя в headless-режиме, считает coverage и пушит в `dev`.

## Шаги одной итерации

### 1. Прочитай контекст
Обязательно прочитай: `tasks.json`, `progress.txt`, `CLAUDE.md`. Просмотри `docs/PRD-Poputchiki-v0.1.md` (v0.3 — продукт), `docs/SPEC-Architecture-v0.1.md` (v0.3 — архитектура и схема БД), `docs/AUTOMATION.md` (правила цикла).

### 2. Выбери ОДНУ задачу
Из `tasks.json` найди задачу:
- статус `pending`,
- все `dependencies` имеют статус `done`,
- максимальный `priority` (`critical` > `high` > `medium` > `low`),
- если несколько подходят — бери первую по списку.

**Не работай над несколькими задачами за итерацию.** Никаких бонусных рефакторов.

### 3. Применяй TDD строго (skill `superpowers:test-driven-development`)
- **RED**: напиши failing tests первым (unit + integration где нужно + e2e где нужно).
- **GREEN**: минимальная реализация, чтобы тесты прошли.
- **REFACTOR**: убери дублирование, чисти.

Каждый новый код-файл должен иметь соответствующий тест-файл.

### 4. Quality gates
Перед коммитом запусти и убедись что зелёное:
- `bun run lint`
- `bun run typecheck`
- `bun run test:unit -- --coverage` (≥90% lines, если уже настроено)
- `bun run test:integration` (если задача интеграционная)
- `bun run test:e2e` (если задача затрагивает UI)
- `bun run test:security` (если задача затрагивает auth/RLS/secrets)

Если какой-то скрипт ещё не настроен (нулевая фаза проекта) — пропусти, но добавь в `progress.txt` строку `TODO: ...`.

Применяй skill `superpowers:verification-before-completion` перед маркером COMPLETE.

### 5. Коммит
- `git add -A`
- `git commit -m "<TYPE>: <описание на русском>"` (TYPE: FEAT|FIX|CHORE|DOCS|REFACTOR|TEST)
- **Без AI-подписи**, без `Co-Authored-By: Claude`, без `Generated with`.
- Коммит **только если все relevant gates зелёные**.
- НЕ пушь — это сделает скрипт-обёртка после coverage check.
- НЕ работай в `main`, всегда `dev` (скрипт уже это проверил).

### 6. Обнови `tasks.json` и `progress.txt`
- В `tasks.json`: смени `status` выбранной задачи на `done`, добавь поле `completed_at: "YYYY-MM-DD HH:MM"`. Использовать UTC.
- В `progress.txt`: добавь запись по формату из шапки файла.

### 7. Выведи маркер
- Успех → `<promise>COMPLETE</promise>`
- Невозможно продолжать (нужна ручная настройка, отсутствует ключ/секрет, миграция конфликтует, dependency которой не должно быть в `done` оказывается недостаточной) → `<promise>BLOCKED</promise>` + добавь блок `BLOCKED:<причина>` в `progress.txt` + смени `status` задачи на `blocked` (НЕ done).

## Жёсткие правила

- **TDD строго**: тесты ПЕРЕД кодом, каждый раз.
- **Одна задача за раз**: никаких бонусных правок.
- **Не push в `main` никогда**.
- **Не пиши секреты в код/коммит/чат/логи**: только `process.env.X` из `.env`.
- **Не делай deploy-related работу** (Traefik labels на сервере, ssh, prod миграции, GH Actions deploy step) — фаза `code-only`. Соответствующие задачи отмечены `phase: post-mvp-deploy`, не бери их.
- **Threat model**: каждый юзер враг. Deny-by-default везде (RLS, auth, валидация).
- **Никаких .gitignore** кроме того что уже есть для секретов.
- **Bun не Node**: используй `bun run`, `bun test`, `bun add`, `bun install`.

## Если что-то идёт не так

- Тест красный после 1-2 попыток фикса → применяй skill `superpowers:debugging` (бинарный поиск, изоляция переменных).
- Не понимаешь требования → читай PRD/SPEC внимательнее, не выдумывай.
- Конфликт между PRD и SPEC → отдельная DOCS-задача (создай её в `tasks.json` с pending), текущую BLOCKED.
- Зависимости задачи на самом деле не done → BLOCKED + причина в `progress.txt`.

## Стек напоминание

- Backend: TypeScript + Hono + Bun
- Frontend: TypeScript + Vite + React (SPA)
- БД: self-hosted PostgreSQL 16 в Docker (НЕ Supabase)
- Auth: собственный JWT после HMAC-проверки Telegram initData (эталон в `Telegram-export-clean`)
- Realtime: SSE через Hono (НЕ Supabase Realtime)
- Карта: Leaflet + OpenStreetMap
- Тесты: Vitest (unit, integration), Playwright (E2E)
- Lint/format: Biome
- Workspace: Bun workspaces (monorepo)
