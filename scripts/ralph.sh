#!/usr/bin/env bash
# Ralph-цикл для Poputchiki — автономная итеративная разработка через Claude Code.
# Запуск: ./scripts/ralph.sh
# Опции (env): RALPH_TIMEOUT, RALPH_RETRIES, RALPH_AUTO_PUSH_DEV, RALPH_DRY_RUN, RALPH_COVERAGE_MIN, RALPH_MAX_BLOCKED
set -euo pipefail

# === конфиг ===

TASKS_FILE="${TASKS_FILE:-tasks.json}"
PROGRESS_FILE="${PROGRESS_FILE:-progress.txt}"
LOG_DIR="${LOG_DIR:-logs}"
PROMPT_FILE="${PROMPT_FILE:-scripts/ralph-tick.md}"
NOTIFY_SCRIPT="${NOTIFY_SCRIPT:-scripts/notify-admin.sh}"

MAX_ITERATION_SEC=${RALPH_TIMEOUT:-1200}        # 20 мин
MAX_RETRIES=${RALPH_RETRIES:-2}
COVERAGE_MIN=${RALPH_COVERAGE_MIN:-90}
AUTO_PUSH_DEV=${RALPH_AUTO_PUSH_DEV:-1}
DRY_RUN=${RALPH_DRY_RUN:-0}
MAX_BLOCKED_STREAK=${RALPH_MAX_BLOCKED:-5}

mkdir -p "$LOG_DIR"

# === utils ===

log() { echo "[$(date '+%H:%M:%S')] $*"; }

notify_admin() {
    [[ -x "$NOTIFY_SCRIPT" ]] && "$NOTIFY_SCRIPT" "$*" >/dev/null 2>&1 || true
}

die() {
    echo "❌ $*" >&2
    notify_admin "❌ Ralph stopped: $*"
    exit 1
}

# === pre-flight ===

preflight() {
    log "Pre-flight..."

    command -v claude >/dev/null   || die "Нет claude CLI. https://docs.claude.com/claude-code"
    command -v bun >/dev/null       || die "Нет bun. Установка: npm i -g bun ИЛИ powershell: irm bun.sh/install.ps1 | iex"
    command -v jq >/dev/null        || die "Нет jq. Установка: scoop install jq ИЛИ choco install jq"
    command -v git >/dev/null       || die "Нет git"
    command -v curl >/dev/null      || die "Нет curl (для notify-admin)"

    [[ -f .env ]]                   || die "Нет .env (есть .env.example — скопируй и заполни)"
    [[ -f "$TASKS_FILE" ]]          || die "Нет $TASKS_FILE"
    [[ -f "$PROMPT_FILE" ]]         || die "Нет $PROMPT_FILE"
    [[ -f docs/PRD-Poputchiki-v0.1.md ]] || die "Нет PRD"
    [[ -f docs/SPEC-Architecture-v0.1.md ]] || die "Нет SPEC"
    [[ -f CLAUDE.md ]]              || die "Нет CLAUDE.md"

    git diff --quiet                || die "Незакомиченные изменения. Закоммить или git stash"
    [[ "$(git branch --show-current)" != "main" ]] || die "Нельзя работать в main. Перейди на dev (git checkout dev)"

    # Lint/typecheck — только если уже есть package.json
    if [[ -f package.json ]]; then
        bun run lint >/dev/null 2>&1     || log "⚠ Lint красный — задача должна это пофиксить"
        bun run typecheck >/dev/null 2>&1 || log "⚠ Typecheck красный — задача должна это пофиксить"
    fi

    log "Pre-flight ✓"
}

# === jq queries ===

ready_pending_count() {
    jq '
      [.tasks[] | select(.status=="done") | .id] as $done
      | [.tasks[]
          | select(.status=="pending")
          | select((.dependencies // []) | all($done | index(.) != null))
        ]
      | length
    ' "$TASKS_FILE"
}

count_status() {
    jq --arg s "$1" '[.tasks[] | select(.status==$s)] | length' "$TASKS_FILE"
}

# === git helpers ===

snapshot_sha() { git rev-parse HEAD; }

snapshot_commit() {
    if ! git diff --quiet HEAD || git ls-files --others --exclude-standard | grep -q .; then
        git add -A
        git commit -m "CHORE: ralph snapshot before iteration $1" --allow-empty 2>/dev/null || true
    fi
}

reset_to() {
    git reset --hard "$1"
    log "Откат до $(git rev-parse --short "$1")"
}

# === run iteration ===

run_iteration() {
    local iteration=$1
    local log_file="$LOG_DIR/iteration-$(printf '%04d' "$iteration").log"
    local start_ts; start_ts=$(date +%s)

    log "=== Итерация $iteration ==="
    snapshot_commit "$iteration"
    local pre_sha; pre_sha=$(snapshot_sha)

    local ready done_n blocked total
    ready=$(ready_pending_count)
    done_n=$(count_status done)
    blocked=$(count_status blocked)
    total=$(jq '.tasks | length' "$TASKS_FILE")
    log "Ready: $ready | Done: $done_n | Blocked: $blocked | Total: $total"

    if [[ "$ready" -eq 0 ]]; then
        local pending; pending=$(count_status pending)
        if [[ "$pending" -gt 0 ]]; then
            log "Pending без ready (deps не сходятся / циркулярные)"
            return 2
        fi
        return 0  # done
    fi

    local prompt; prompt="$(cat "$PROMPT_FILE")"

    if [[ "$DRY_RUN" == "1" ]]; then
        prompt="${prompt}

⚠ DRY-RUN: НЕ ВНОСИ ИЗМЕНЕНИЙ. Опиши какую задачу выбрал, как бы её делал. exit без коммитов."
        timeout "${MAX_ITERATION_SEC}" claude --permission-mode plan -p "$prompt" 2>&1 | tee "$log_file" || true
        return 0
    fi

    for retry in $(seq 0 "$MAX_RETRIES"); do
        local rc=0
        timeout "${MAX_ITERATION_SEC}" claude \
            --permission-mode acceptEdits \
            -p "$prompt" 2>&1 | tee "$log_file" || rc=$?

        # Anthropic rate limit — особый случай
        if grep -qiE "rate_?limit|status.+429|retry-after" "$log_file"; then
            log "🌐 Anthropic rate limit — sleep 60"
            sleep 60
            return 6
        fi

        if [[ $rc -eq 124 ]]; then
            log "⏱ Timeout итерации (${MAX_ITERATION_SEC}s)"
            return 3
        fi

        if grep -q '<promise>BLOCKED</promise>' "$log_file"; then
            log "🚧 Задача BLOCKED"
            return 4
        fi

        # Coverage gate (если уже есть отчёт)
        if [[ -f coverage/coverage-summary.json ]]; then
            local cov
            cov=$(jq -r '.total.lines.pct // 0' coverage/coverage-summary.json)
            cov_int=${cov%.*}
            if (( cov_int < COVERAGE_MIN )); then
                log "Coverage ${cov}% < ${COVERAGE_MIN}% — откат + retry $retry"
                reset_to "$pre_sha"
                continue
            fi
        fi

        if [[ "$AUTO_PUSH_DEV" == "1" ]]; then
            git push origin dev 2>&1 | tail -3 || log "⚠ git push origin dev не прошёл"
        fi

        local elapsed=$(( $(date +%s) - start_ts ))
        log "✓ Итерация $iteration ОК за ${elapsed}s"
        notify_admin "✓ Iter $iteration done in ${elapsed}s. Done: $((done_n+1))/$total"
        return 0
    done

    log "❌ Все retry исчерпаны для итерации $iteration"
    reset_to "$pre_sha"
    return 5
}

# === graceful shutdown ===

ITERATION=1
trap 'log "Прервано Ctrl+C — финализирую"; git add -A 2>/dev/null; git commit -m "CHORE: ralph прерван на итерации $ITERATION" --allow-empty 2>/dev/null || true; notify_admin "🛑 Ralph прерван на итерации $ITERATION"; exit 130' INT TERM

# === main loop ===

main() {
    preflight
    local pending_total; pending_total=$(count_status pending)
    notify_admin "▶ Ralph старт. Pending: ${pending_total}, Done: $(count_status done)"

    BLOCKED_STREAK=0

    while true; do
        local rc=0
        run_iteration "$ITERATION" || rc=$?

        case $rc in
            0)
                if [[ "$(count_status pending)" -eq 0 ]]; then
                    log "🎉 Все задачи выполнены за $ITERATION итераций"
                    notify_admin "🎉 Все задачи выполнены за $ITERATION итераций"
                    exit 0
                fi
                BLOCKED_STREAK=0
                ;;
            2)
                notify_admin "Pending без ready (deps циркулярные). Стоп."
                exit 2
                ;;
            6)
                log "Rate-limit retry без инкремента ITERATION"
                continue
                ;;
            *)
                BLOCKED_STREAK=$((BLOCKED_STREAK + 1))
                log "BLOCKED_STREAK=$BLOCKED_STREAK (rc=$rc)"
                ;;
        esac

        if [[ $BLOCKED_STREAK -ge $MAX_BLOCKED_STREAK ]]; then
            log "🛑 $MAX_BLOCKED_STREAK подряд BLOCKED — стоп для ручного разбора"
            notify_admin "🛑 Ralph stopped: $MAX_BLOCKED_STREAK consecutive failures"
            exit 1
        fi

        ITERATION=$((ITERATION + 1))
    done
}

main "$@"
