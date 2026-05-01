# Стратегия автономной разработки Poputchiki

**Версия:** 0.1
**Дата:** 2026-05-01
**Статус:** Draft

> Документ обсуждает: (1) нужен ли внешний `ralph.sh` или достаточно встроенных возможностей Claude Code, (2) как именно организовать автономный цикл, чтобы он был надёжным.

---

## TL;DR

**Гибрид**: внешний bash-loop (`scripts/ralph.sh`) + встроенные Claude Code natives внутри сессии.

- `ralph.sh` — тонкая оболочка с safety: timeout, retry, логи итераций, pre-flight проверки, coverage gate, graceful shutdown. Ничего «умного».
- Внутри сессии — Skills, Hooks, Subagents, MCP, TaskCreate, /loop делают тяжёлую работу.
- `tasks.json` — durable persistent backend, читается/пишется и снаружи, и изнутри.

Чистая оболочка ≠ дублирование Claude Code. Оболочка — про **headless ticking**, чтобы цикл крутился без открытой сессии.

---

## Что появилось в Claude Code, чего не было у Ralph

Разные подходы к автоматизации, и сильные стороны:

### Skills
Переиспользуемые блоки инструкций. Активируются по триггеру (slash-команда / контекстное совпадение). Дают рабочий процесс типа `/auto-work`, `/wiki-init`, `superpowers:test-driven-development`, `superpowers:debugging`.

**Сильнее ralph.sh в чём:** структурированный, версионируемый процесс работы. Не просто промпт в `cat <<'EOF'`, а полноценные паттерны с контекстом и red-flags-листом.

### Hooks
Запускаются на события (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`).

**Сильнее ralph.sh в чём:** гарантированное срабатывание; нет шанса агенту «забыть» проверку. Например, `PostToolUse(Write|Edit) → run lint+typecheck` — Claude никогда не сможет закоммитить unlinted код.

### Subagents
Параллельные специализированные агенты с изолированным контекстом (Explore, code-reviewer, и т.д.).

**Сильнее ralph.sh в чём:** распараллеливание независимых задач в одной сессии без захвата основного контекста.

### MCP servers
Безопасный, типизированный доступ к внешним системам (Supabase, GitHub, Playwright, Context7) без shelling-out.

**Сильнее ralph.sh в чём:** ralph мог бы вызвать `psql` или `curl`, но MCP даёт schema-aware вызовы с auth-обёрткой, без рисков command injection.

### TaskCreate (внутри-сессионный)
Структурированный task tracker. Не заменяет `tasks.json` (он durable между сессиями), но удобен для отслеживания шагов внутри одной задачи.

### `/loop` и `/schedule`
- `/loop` — повторение по интервалу в текущей сессии.
- `/schedule` — remote agents на cron (cloud-based, не зависит от того, включена ли машина заказчика).

**Сильнее ralph.sh в чём:** `/schedule` — буквально replacement для cron + ralph, если задача может работать за один тик.

---

## Что Ralph умеет, а Claude Code natives — нет

### 1. Headless ticking без открытой сессии
Claude Code session имеет конечную длительность. Если задача идёт сутками, нужно либо:
- `/schedule` (remote, в облаке Anthropic — но это для отдельных тиков, не «крутить пока не закончатся pending»),
- внешний оркестратор, который запускает `claude --permission-mode acceptEdits -p "..."` headless.

Ralph — самый простой вариант второго.

### 2. Полная независимость от Anthropic-инфраструктуры
Если Anthropic API даунайнс — `/schedule` стоит, ralph — может переключиться на codex/любого совместимого CLI-агента.

### 3. Явные post-mortem логи
Ralph пишет stdout каждой итерации в файл; легко делать поиск «где сломалось». Внутри Claude Code чат — труднее navigate.

### 4. Простота retry / kill
`Ctrl+C` → ralph остановился. Перезапуск из того же места (`tasks.json` — единственный state). Никакого session resume.

### 5. Audit trail для не-Anthropic stakeholder-ов
Если потом покажешь работу другому разработчику — bash + tasks.json + progress.txt прозрачнее, чем «верь мне, агент сделал».

---

## Решение: гибрид

```
┌─────────────────────────────────────────────────────────────┐
│  scripts/ralph.sh  (внешний headless loop)                  │
│                                                             │
│  while has_pending_tasks; do                                │
│    iteration++                                              │
│    pre_flight_check                                         │
│    backup_commit                                            │
│    log_file = logs/iteration-${iteration}.txt               │
│    timeout 20m claude --permission-mode acceptEdits \       │
│      -p "$(cat prompts/ralph-tick.md)" 2>&1 | tee $log_file │
│    if [[ result =~ COMPLETE ]]; then ...                    │
│    if test_coverage < 90: rollback + notify                 │
│  done                                                       │
└──────────────┬──────────────────────────────────────────────┘
               │ headless invoke
               ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude Code session (одна итерация)                        │
│                                                             │
│  1. SessionStart hook: загружает CLAUDE.md, .memory/, MCP   │
│  2. Читает tasks.json + progress.txt                        │
│  3. Берёт ОДНУ pending task с max priority + deps=done      │
│  4. Skill: superpowers:test-driven-development              │
│     ├─ red: пишет failing tests                             │
│     ├─ green: реализует                                     │
│     └─ refactor: чистит                                     │
│  5. PostToolUse(Write|Edit): hook запускает lint+typecheck  │
│  6. Subagent code-reviewer (если задача large)              │
│  7. MCP supabase: если задача про схему/RLS                 │
│  8. MCP playwright: если задача про E2E                     │
│  9. Skill: verification-before-completion → run all tests   │
│  10. Update tasks.json (status=done) + progress.txt          │
│  11. Commit (PreToolUse(Bash:git push origin main) → block)  │
│  12. Output <promise>COMPLETE</promise>                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Конкретный план для Poputchiki

### Файл `scripts/ralph.sh` (адаптация существующего)

Минимальные улучшения из `saas/saas-project-ralph/Доработать_скрипт.md` (приоритет 1):

```bash
#!/usr/bin/env bash
set -euo pipefail

TASKS_FILE="tasks.json"
LOG_DIR="logs"
MAX_ITERATION_SEC=${RALPH_TIMEOUT:-1200}   # 20 минут по умолчанию
MAX_RETRIES=${RALPH_RETRIES:-2}
COVERAGE_MIN=${RALPH_COVERAGE_MIN:-90}

mkdir -p "$LOG_DIR"

# Pre-flight: проверки перед стартом цикла
preflight() {
    command -v claude >/dev/null   || { echo "Нет claude CLI"; exit 1; }
    command -v bun >/dev/null       || { echo "Нет bun"; exit 1; }
    command -v jq >/dev/null        || { echo "Нет jq"; exit 1; }
    [[ -f .env.local ]]              || { echo "Нет .env.local"; exit 1; }
    git diff --quiet                 || { echo "Незакомиченные изменения"; exit 1; }
    bun test:smoke || { echo "Smoke не проходит"; exit 1; }
}

# Pending tasks через jq, не grep — стабильнее
has_pending_tasks() {
    local n
    n=$(jq '[.tasks[] | select(.status=="pending")] | length' "$TASKS_FILE")
    [ "$n" -gt 0 ]
}

# Snapshot перед каждой итерацией
snapshot_commit() {
    git add -A
    git diff --staged --quiet || \
        git commit -m "CHORE: snapshot перед итерацией ${ITERATION}" --allow-empty
}

# Coverage check после итерации
check_coverage() {
    local cov
    cov=$(jq '.coverage.total.lines.pct' coverage/coverage-summary.json 2>/dev/null || echo 0)
    if (( $(echo "$cov < $COVERAGE_MIN" | bc -l) )); then
        echo "Coverage $cov% < $COVERAGE_MIN% — откатываемся"
        git reset --hard HEAD~1
        return 1
    fi
}

# Graceful shutdown
trap 'echo "Прервано пользователем — финализирую"; git add -A && git commit -m "CHORE: прервано Ctrl+C" --allow-empty || true; exit 130' INT TERM

ITERATION=1
while has_pending_tasks; do
    echo "=== Итерация $ITERATION ==="
    preflight
    snapshot_commit

    LOG="$LOG_DIR/iteration-$(printf '%04d' $ITERATION).txt"

    for retry in $(seq 0 $MAX_RETRIES); do
        if timeout "${MAX_ITERATION_SEC}" claude \
                --permission-mode acceptEdits \
                -p "$(cat scripts/ralph-tick.md)" \
                2>&1 | tee "$LOG"; then
            check_coverage && break
        fi
        echo "Попытка $((retry+1)) не прошла, retry…"
    done

    ((ITERATION++))
done

echo "Все задачи выполнены. Итераций: $((ITERATION-1))"
```

### Файл `scripts/ralph-tick.md` (промпт одной итерации)

```markdown
@tasks.json @progress.txt

Ты работаешь в проекте Poputchiki — Telegram MiniApp для попутчиков ЖК Царёво.

Контекст:
- PRD: docs/PRD-Poputchiki-v0.1.md
- SPEC: docs/SPEC-Architecture-v0.1.md
- OPEN-QUESTIONS: docs/OPEN-QUESTIONS-v0.1.md
- AUTOMATION: docs/AUTOMATION.md

Шаги одной итерации:

1. Прочитай CLAUDE.md и tasks.json. Найди ОДНУ задачу со статусом pending и наивысшим приоритетом, у которой все dependencies со статусом done.
2. Применяй skill superpowers:test-driven-development:
   2.1. RED: напиши failing tests (unit + integration + e2e где уместно).
   2.2. GREEN: минимальная реализация, чтобы тесты прошли.
   2.3. REFACTOR: убери дублирование, оставь только то, что покрыто тестами.
3. Проверь обязательные ворота:
   - bun run lint        — чисто
   - bun run typecheck   — чисто
   - bun run test:unit   — все зелёные
   - bun run test:integration — все зелёные
   - bun run test:contract — все зелёные
   - bun run test:e2e    — все зелёные
   - bun run coverage:check — ≥90%
4. Обнови tasks.json (status: done; дата завершения).
5. Допиши progress.txt по формату из шапки файла.
6. git add -A && git commit -m "<TYPE>: <описание на русском>" — без AI-подписи.

Если задача полностью завершена — выведи <promise>COMPLETE</promise>.

Если что-то блокирует (миграция БД, отсутствующий env, сломанный bun) — напиши блок BLOCKED:<причина> в progress.txt и переведи статус задачи в blocked.

РАБОТАЙ ТОЛЬКО НАД ОДНОЙ ЗАДАЧЕЙ. Никаких бонусных рефакторов.
```

### Hooks внутри Claude Code (`.claude/settings.json` репо)

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash:git push origin main",
        "command": "echo 'BLOCKED: push в main запрещён без явного приказа' && exit 1"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bun run lint:staged && bun run typecheck:staged",
        "onError": "block"
      }
    ],
    "Stop": [
      {
        "command": "bun run test:fast"
      }
    ]
  }
}
```

### Skills, которые мы будем использовать

- `superpowers:test-driven-development` — обязательный для каждой задачи feature/fix.
- `superpowers:debugging` — при первом красном тесте, который не зеленеет за 1 попытку.
- `superpowers:verification-before-completion` — перед COMPLETE-маркером.
- `superpowers:dispatching-parallel-agents` — для задач, где нужны Explore + code-reviewer одновременно.
- `code-review:code-review` — раз в N задач (или перед merge ветки в main).
- `simplify` — после крупных задач, не чаще 1 раз в 5 итераций.

### MCP servers

- `supabase` — при работе со схемой / RLS / миграциями.
- `playwright` — при написании / отладке E2E.
- `context7` — для актуальных доков Hono / Supabase / Leaflet.
- `github` — для PR/issue (когда понадобятся, в MVP не сразу).

---

## Когда чем пользоваться (cheat sheet)

| Сценарий | Инструмент |
|----------|-----------|
| Запустить цикл «делай задачи пока не закончатся» | `scripts/ralph.sh` |
| Один разовый тик в фоне (раз в день) | `/schedule` Claude Code |
| Параллельный обзор кода после большой задачи | `Agent(subagent_type="code-reviewer")` |
| Поиск по большой кодовой базе | `Agent(subagent_type="Explore")` |
| Гарантия, что lint всегда запустится | hook `PostToolUse(Edit\|Write)` |
| Гарантия, что push в main не уйдёт | hook `PreToolUse(Bash:git push origin main)` |
| Структурированный TDD-процесс | skill `superpowers:test-driven-development` |
| Доступ к Supabase / GitHub / Playwright | MCP |

---

## Риски выбранного подхода

1. **Двойной источник правды**: hooks + ralph.sh могут запустить тесты несколько раз → trade-off скорость vs надёжность. Решение: hooks делают «быстрые» проверки (lint, typecheck, smoke), ralph делает «полные» (всё + coverage gate).
2. **Hooks могут пропускаться** при `--permission-mode bypassPermissions`. Не использовать этот режим в ralph.sh; только `acceptEdits`.
3. **Зависимость от внешних tools** (jq, bun, gpg). Pre-flight check минимизирует.
4. **Bun не везде стабилен** (см. OPEN-QUESTIONS I.7). Если на этапе разработки прорастёт несовместимость — fallback на Node для конкретного контейнера.

---

## Вопросы для обсуждения с заказчиком

1. Запускать ralph.sh на машине заказчика (терминал должен быть открыт) или арендовать минимальный VPS на $5/мес для autonomous run? — последний противоречит бюджету $0, но дёшев и снимает «забыл выключить ноутбук».
2. Использовать `/schedule` для daily tick (один автономный шаг в сутки в облаке Anthropic) — это отдельная стоимость на стороне платных Claude Code workspace.
3. Готовы ли на agentic git push в `dev` ветку без подтверждения? (push в `main` — точно нет.) Если да — экономим клики при каждой задаче.
