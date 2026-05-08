# Процесс одной итерации Poputchiki (обязательный)

Расширение `CLAUDE.md`. Файл для нейросети, не для людей. Грузить когда выбираешь следующую задачу.

## 1. Pre-flight
```bash
command -v bun >/dev/null  || echo "❌ bun не установлен. Антон ставит: irm bun.sh/install.ps1 | iex (PowerShell) или npm i -g bun"
command -v jq >/dev/null   || echo "⚠ jq не установлен (нужен для парсинга tasks.json в shell). Антон ставит: scoop install jq"
[[ -f .env ]]              || echo "❌ нет .env — скопируй .env.example и заполни"
[[ -f tasks.json ]]        || echo "❌ нет tasks.json"
git diff --quiet           || echo "⚠ незакомиченные изменения — закоммить или git stash перед стартом"
[[ "$(git branch --show-current)" != "main" ]] || echo "❌ ты в main, перейди на dev"
[[ -f package.json ]] && bun run lint && bun run typecheck
```
Любая ❌ → стоп, доложи Антону, не выбирай задачу.

## 2. Snapshot SHA
`SNAPSHOT=$(git rev-parse HEAD)` — для отката если задача провалится.

## 3. Выбор задачи
Из `tasks.json`: статус `pending`; все `dependencies` со статусом `done`; max `priority` (`critical`>`high`>`medium`>`low`); если несколько подходят — первая по списку; НЕ бери `phase: post-mvp-deploy` пока Антон не разрешит.
Одна задача за итерацию. Никаких бонусных рефакторов. TodoWrite с шагами (acceptance_criteria → todos).

## 4. TDD строго (skill `superpowers:test-driven-development`)
- RED: тест-файл первым (упадёт в CI)
- GREEN: минимальная реализация для прохождения тестов в CI
- REFACTOR: убрать дублирование, чистка
Каждый новый код-файл → соответствующий тест-файл.

## 5. Quality gates

Перед каждым push — обязательно локально (быстро, без Docker):
```bash
bun run lint        # ~0.1с — biome format/lint
bun run typecheck   # ~2с — tsc
bun run test:unit   # ~4с — unit-only, без DB
```
Любая ошибка → фикс до push. Не пушить красный локальный lint/typecheck.

Только в CI (`.github/workflows/ci.yml`) — никогда локально:
- Integration/E2E/security тесты, coverage gate, Docker-сборка
- После push в `dev` → статус через `gh run list` или GitHub UI
- CI красный → читать логи (`gh run view`), фиксить, снова push
- НИКОГДА не запускать Docker, не поднимать контейнеры локально

## 6. Coverage gate (в CI)
Минимум: 95% lines / 95% branches / 95% functions / 95% statements. Target — 100%. Проверка в CI через `vitest --coverage` + `scripts/check-coverage.js`. CI падает по coverage → фиксить тесты/код → push → ждать CI.

## 7. Коммит (включает tasks.json + progress.txt)
Обновить до коммита: `tasks.json` (`status→done`, `completed_at`), `progress.txt` (запись по формату шапки).
```bash
git add -A
git commit -m "<TYPE>: <описание на русском>"
```
TYPE: `FEAT|FIX|CHORE|DOCS|REFACTOR|TEST`.
Без AI-подписи и AI-ссылок. Запрещено в commit subject/body, PR, release notes, changelog, issue comments, docs:
- `Co-Authored-By: Claude` / `Co-Authored-By: Claude Sonnet` / любые `noreply@anthropic.com`
- `Generated with Claude Code` / `🤖 Generated with`
- URL `https://claude.ai/code/session_*` или любые другие `claude.ai/*`
Удалить до commit/push. Проверять `git show HEAD` после каждого коммита.
Кириллица: bash ломает → PowerShell или here-doc для русского.

## 8. Push
```bash
git push origin dev
```
`dev` — autonomous push разрешён. `main` — никогда без явного приказа Антона.

## 9. Маркер итерации
- Успех → «Итерация N завершена» в чат + TG-нотификация (п.10)
- BLOCKED → `status` задачи в `tasks.json` → `blocked`, блок `BLOCKED:<причина>` в `progress.txt`, сказать Антону что нужно вручную

## 10. TG-нотификация (опционально)
```bash
./scripts/notify-admin.sh "✓ TASK-XXX done. <краткое описание>"
```
Молча skip если `BOT_TOKEN`/`ADMIN_TG_CHAT_ID` отсутствуют в `.env`.

## 12. Code review после крупных вех
После каждой вехи — стоп, code review перед следующей задачей:
| Веха | После какой задачи |
|---|---|
| Infra + DB готовы | TASK-008 (все миграции) |
| Auth полностью готов | TASK-015 (JWT refresh + logout) |
| Core API готов | TASK-038 (все rides/requests endpoints) |
| Frontend skeleton + auth | TASK-016 |
| Full E2E happy path | TASK-060 |
| Security hardening done | TASK-090 |
1) `git diff dev..HEAD` или `git log --oneline` — масштаб; 2) skill `superpowers:requesting-code-review`; 3) issues → задачи `priority: high` в `tasks.json` (перед следующей вехой); 4) не продолжать пока критические issues не закрыты.
Security review (отдельно от code review) встроен в CI через `bun run test:security` + nightly OWASP ZAP (TASK-121).

## 13. Следующая итерация
Pending-задачи с готовыми deps есть → если Антон сказал «продолжай пока не закончится» / запущен `/loop` → к шагу 1. Иначе → ждать инструкций.
