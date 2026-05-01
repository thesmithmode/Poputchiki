# Стратегия автономной разработки Poputchiki

**Версия:** 0.2
**Дата:** 2026-05-01
**Статус:** Draft

> Документ обсуждает: (1) нужен ли внешний `ralph.sh` или достаточно встроенных возможностей Claude Code, (2) как именно организовать автономный цикл, чтобы он был надёжным.

> v0.2 (2026-05-01): заказчик подтвердил вариант через скрипт. Добавлен расширенный список доработок под задачи Poputchiki в §«Конкретные доработки скрипта под Poputchiki» в конце.

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

1. Запускать ralph.sh на машине заказчика (терминал должен быть открыт) или на том же домашнем сервере где Traefik (через `tmux`/`screen` или systemd-unit) — рекомендую второе: запустил и забыл.
2. Готовы ли на agentic `git push origin dev` без подтверждения? (push в `main` — точно нет.) Если да — экономим клики.

---

## Конкретные доработки скрипта под Poputchiki

Базовый шаблон выше — общий. Ниже — что именно добавляем под наш проект, помимо стандартного `Доработать_скрипт.md`-листа из `saas-project-ralph`.

### 1. Точечный pre-flight для нашего стека
```bash
preflight_poputchiki() {
    # Базовое окружение
    command -v claude >/dev/null   || die "Нет claude CLI"
    command -v bun >/dev/null       || die "Нет bun"
    command -v jq >/dev/null        || die "Нет jq"
    command -v gpg >/dev/null       || die "Нет gpg (нужен для бэкапов)"
    command -v supabase >/dev/null  || die "Нет supabase CLI"

    # Файлы
    [[ -f .env.local ]]    || die "Нет .env.local"
    [[ -f tasks.json ]]    || die "Нет tasks.json"
    [[ -f docs/PRD-Poputchiki-v0.1.md ]] || die "Нет PRD — что мы делаем?"

    # Состояние git
    git diff --quiet                  || die "Незакомиченные изменения"
    [[ "$(git branch --show-current)" != "main" ]] || die "Нельзя работать в main"

    # Локальная Supabase (для integration tests)
    supabase status >/dev/null 2>&1   || die "supabase start не запущена"

    # Smoke (быстро)
    bun run lint >/dev/null            || die "Lint красный — фиксим вручную"
    bun run typecheck >/dev/null       || die "Типы красные — фиксим вручную"
}
```

### 2. Tasks dependency-aware выбор
В стандартном `ralph.sh` агенту даётся «найди pending». В нашем случае задача может зависеть от других — выбирать только готовые к работе:
```bash
ready_tasks_count() {
    jq '
      [ .tasks[]
        | select(.status == "pending")
        | select(
            (.dependencies // []) as $deps
            | $deps | all(. as $d | (any(.. | objects | select(.id == $d) | .status == "done"; .)))
          )
      ] | length
    ' tasks.json
}
```

(Простая проверка: pending без unmet deps.)

### 3. Статус `blocked` и порог остановки
Агент при невозможности выполнить (например, миграция требует ручного вмешательства) возвращает маркер `<promise>BLOCKED</promise>` + причину в `progress.txt`. Скрипт переводит задачу в `status: blocked` и идёт дальше.
**Защита от зацикливания**: если 5 итераций подряд получили BLOCKED → останавливаемся и шлём админу алерт в TG.
```bash
BLOCKED_STREAK=0
MAX_BLOCKED_STREAK=5

# в цикле после run:
if grep -q '<promise>BLOCKED</promise>' "$LOG"; then
    ((BLOCKED_STREAK++))
    if [[ $BLOCKED_STREAK -ge $MAX_BLOCKED_STREAK ]]; then
        notify_admin "Ralph остановлен: $MAX_BLOCKED_STREAK подряд BLOCKED. Нужно ручное вмешательство."
        exit 2
    fi
else
    BLOCKED_STREAK=0
fi
```

### 4. TG-уведомления админу о ходе цикла
Без зависимостей — просто `curl` на Bot API:
```bash
notify_admin() {
    local text="$1"
    [[ -z "${ADMIN_TG_CHAT_ID:-}" ]] && return 0
    [[ -z "${BOT_TOKEN:-}" ]] && return 0
    curl -sS -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${ADMIN_TG_CHAT_ID}" \
        --data-urlencode "text=[ralph] ${text}" \
        >/dev/null || true
}

# триггеры:
notify_admin "Старт цикла. pending=${PENDING}"             # на старте
notify_admin "Итерация ${ITERATION} завершена за ${ELAPSED}s. Готово: ${DONE}/${TOTAL}"  # после задачи
notify_admin "❗ Coverage упал ниже ${COVERAGE_MIN}% — откатываюсь"                     # на провале
notify_admin "Все задачи выполнены за ${ITERATION} итераций."                          # финал
```

### 5. Per-task git workflow в dev
Делаем плоско: коммиты сразу в `dev`, по одному коммиту на задачу. Никаких feature-веток (избыточно для нашего объёма).
```bash
git_commit_task() {
    local task_id="$1"
    local title="$2"
    git add -A
    git commit -m "$(cat <<EOF
${title}

Реализация TASK-${task_id}. Coverage: $(jq '.coverage.total.lines.pct' coverage/coverage-summary.json)%.
EOF
)"
    if [[ "${RALPH_AUTO_PUSH_DEV:-0}" == "1" ]]; then
        git push origin dev
    fi
}
```
Флаг `RALPH_AUTO_PUSH_DEV=1` включаем только если заказчик разрешит.

### 6. Миграция-aware safety
Если задача затрагивает SQL-миграцию (`supabase/migrations/`) — обязательная страховка:
```bash
if git diff --staged --name-only | grep -q '^supabase/migrations/'; then
    bun run backup:db || die "Backup БД перед миграцией не прошёл"
    bun run db:migrate || die "Миграция не прошла"
    bun run test:rls-deny || die "RLS deny-by-default тест упал — откат"
fi
```

### 7. Schema drift gate
Если задача меняет `packages/shared/src/schemas/` — обязательно `bun run test:contract`, чтобы api↔web остались согласованы.

### 8. TDD enforcement в pre-commit
До коммита проверять что новые файлы кода имеют соответствующие тесты:
```bash
new_code_files=$(git diff --staged --name-only | grep -E '^(apps|packages)/.*\.(ts|tsx)$' | grep -v '\.test\.' | grep -v '/tests/')
for f in $new_code_files; do
    test_file=$(echo "$f" | sed -E 's|src/|tests/unit/|; s|\.tsx?$|.test.&|; s|.test.ts$|.test.ts|')
    if [[ ! -f "$test_file" ]]; then
        die "Новый файл $f без теста $test_file (TDD strict mode)"
    fi
done
```

### 9. Метрики итерации
В конце каждой итерации скрипт логирует таймер и обновляет `progress.txt`:
```
Итерация ${ITERATION}: ${ELAPSED_SEC}s | задача TASK-${ID} | coverage ${COV}%
```
Среднее время → ETA остатка для admin-notify.

### 10. Остановка при rate-limit Anthropic API
Если в выводе claude мелькнёт `429` или `rate_limit` — пауза 60 секунд и retry, не считая в `BLOCKED_STREAK`.

### 11. DRY-RUN режим для отладки промпта
```bash
if [[ "${RALPH_DRY_RUN:-0}" == "1" ]]; then
    # claude получает дополнительный флаг "только проанализируй, ничего не меняй"
    PROMPT="${PROMPT}\n\nDRY-RUN: НЕ ВНОСИ ИЗМЕНЕНИЙ. Опиши что бы сделал, и что бы потребовалось."
    timeout "${MAX_ITERATION_SEC}" claude --permission-mode plan -p "$PROMPT"
    exit 0
fi
```

### 12. Скрипт-обёртки
```
scripts/
  ralph.sh                — главный loop
  ralph-tick.md           — промпт одной итерации
  ralph-bootstrap.sh      — первый запуск: проверки, копирование .env.example, supabase start
  notify-admin.sh         — тонкая обёртка над curl bot API
  backup-db.sh            — pg_dump + zstd + gpg, вызывается из cron worker и из миграции-safety
  restore-test.sh         — weekly restore drill
  schema-drift-check.sh   — упомянутый contract gate
```

---

## Что мы НЕ добавляем в скрипт (намеренно)

По принципу «не забегать вперёд»:
- ❌ Discord webhook — у нас уже есть TG.
- ❌ Конфиг-файл `ralph.config.json` — пока хватает env-переменных.
- ❌ Cyclomatic complexity / Stryker mutation testing — в roadmap, не в MVP.
- ❌ Feature-ветки на каждую задачу — плоский dev.
- ❌ Performance regression detection — appliction слишком молодой, нет baseline.
- ❌ Параллельный запуск задач — по одной за итерацию.
- ❌ Discord/Slack/email алерты — только TG.
