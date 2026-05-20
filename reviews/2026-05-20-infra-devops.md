# Code Review: infra/ scripts/ .github/ + corner configs — 2026-05-20

## Summary

28 findings: 4 critical, 8 high, 10 medium, 6 low.

Инфраструктура в целом зрелая — set -euo pipefail везде, healthcheck на каждом сервисе, Trivy gate,
name: в сетях (из wiki-концепта). Критические дыры касаются безопасности deploy-пайплайна и
надёжности rollback при первом деплое. Много medium-проблем в observability и backup.

---

## Critical

### [C1] deploy.yml запускается при push в main без проверки CI на dev — прямой deploy без green CI

- Files: `.github/workflows/deploy.yml`:4-5, `.github/workflows/ci.yml`:5-6
- Problem: CI запускается на `branches-ignore: [main]`, то есть только на dev и feature-ветках.
  deploy.yml запускается при `push: branches: [main]`. Если кто-то сделает direct push в main
  (через merge без squash проверки, или через force-push обход хука), deploy пойдёт без зелёного CI.
  Нет `workflow_run: workflows: [CI]` с `types: [completed]` и `conclusions: success`.
- Why bad: Сломанный код может уйти в прод. Для проекта с 50k concurrent users это критично.
  Хук PreToolUse блокирует Claude, но не человека с прямым git доступом.
- Fix:
  ```yaml
  # deploy.yml — добавить workflow_run gate:
  on:
    workflow_run:
      workflows: ["CI"]
      branches: [main]
      types: [completed]

  jobs:
    build-and-push:
      if: ${{ github.event.workflow_run.conclusion == 'success' }}
  ```
  Либо включить Branch Protection Rules в GitHub Settings с required status checks перед merge.
- Evidence: ci.yml:5 `branches-ignore: [main]`, deploy.yml:4-5 `push: branches: [main]`.

---

### [C2] deploy.sh — pull retry loop не завершает скрипт при исчерпании всех попыток

- Files: `scripts/deploy.sh`:57-61
- Problem: После трёх неудачных попыток `docker compose pull` цикл for завершается без exit,
  и скрипт продолжает выполнение — запускает migrate и `docker compose up -d` со старыми образами.
  Результат: production запускает предыдущую версию под новым SHA, записывает SHA как current-tag,
  rollback становится невозможным (last-good-tag и current-tag совпадают или указывают не туда).
- Why bad: Silent partial deploy. Оператор видит SUCCESS, но в production стоит старый код.
  Следующий rollback укажет на этот же "успешный" SHA.
- Fix:
  ```bash
  pulled=false
  for i in 1 2 3; do
    IMAGE_TAG="$SHA" $COMPOSE pull && pulled=true && break
    echo "Pull attempt $i failed, retrying in 30s..."
    sleep 30
  done
  if [[ "$pulled" != "true" ]]; then
    echo "ERROR: docker pull failed after 3 attempts — aborting deploy" >&2
    bash "$STATE_DIR/scripts/notify-admin.sh" "deploy $SHA ABORTED: pull failed" || true
    exit 1
  fi
  ```
- Evidence: deploy.sh:57-61 — for loop ends, execution falls through to line 65 (`migrate`).

---

### [C3] pg_hba.conf — local/localhost connections используют trust без пароля

- Files: `infra/postgres/pg_hba.conf`:4-8
- Problem: `local all all trust` и `host all all 127.0.0.1/32 trust` — любой процесс внутри
  контейнера с доступом к Unix socket или localhost может подключиться к Postgres как любой
  пользователь включая superuser без пароля. В production контейнере `bun` (USER bun) или
  злоумышленник получивший RCE через приложение имеет прямой доступ к БД как postgres/superuser.
- Why bad: Полный обход парольной защиты. Нарушает принцип least privilege. Уязвимость эксплуатируется
  при любом RCE в контейнере или соседнем контейнере в той же сети.
- Fix: Заменить trust на scram-sha-256 для localhost:
  ```
  local   all             all                                     scram-sha-256
  host    all             all             127.0.0.1/32            scram-sha-256
  host    all             all             ::1/128                 scram-sha-256
  ```
  Исключение: `local all postgres scram-sha-256` может потребовать отдельного superuser password.
  Healthcheck (`pg_isready`) не требует auth — работает без изменений.
- Evidence: pg_hba.conf:4-8.

---

### [C4] backup-db.sh — retention 3 файла недостаточен для 50k-пользовательского проекта + backup без pre-deploy

- Files: `scripts/backup-db.sh`:22-24, `scripts/deploy.sh`:52-53
- Problem: (a) Retention 3 файла при ежедневном запуске = 3 дня. При тихой data corruption
  обнаруженной на 4-й день — все backups уже corrupted. Для проекта с PII (pgcrypto) минимум 7 дней,
  лучше 30. (b) deploy.sh:52-53 явно пропускает pre-deploy backup. Если migration содержит
  деструктивный DDL (DROP COLUMN, TRUNCATE) — откатиться к данным до деплоя невозможно.
- Why bad: (a) Узкое окно восстановления — потеря данных при обнаружении corruption с задержкой.
  (b) Migration failures after schema change без pre-deploy backup = невосстановимая потеря данных.
- Fix:
  ```bash
  # backup-db.sh:22
  | tail -n +8  # хранить 7 файлов вместо 3 (tail -n +4)

  # deploy.sh — вместо "backup skipped":
  echo "--- [1/7] pre-deploy backup ---"
  bash "$STATE_DIR/scripts/backup-db.sh" || {
    echo "ERROR: pre-deploy backup failed — aborting" >&2
    exit 1
  }
  ```
- Evidence: backup-db.sh:22 `tail -n +4`, deploy.sh:52-53.

---

## High

### [H1] Единый 120s timeout для всех 5 сервисов в deploy.sh вызывает ложные rollback

- Files: `scripts/deploy.sh`:75-98
- Problem: DEADLINE=$((SECONDS + 120)) применяется ко всем 5 сервисам последовательно. Если api
  (первый в списке) занял 110s, то для notifier и cron осталось по 10s. notifier и cron с
  `kill -0 1` healthcheck (process check) могут легитимно стартовать дольше при холодном старте.
  Баг уже зафиксирован в concepts/deploy-single-healthcheck-window.md, но не исправлен.
- Why bad: Ложный rollback на живом prod под нагрузкой. Каждый ложный rollback — простой сервиса.
- Fix (per-service timeouts):
  ```bash
  declare -A SVC_TIMEOUT=(
    [api]=60 [webhook]=60 [web]=30 [notifier]=120 [cron]=120
  )
  for SVC in "${SERVICES[@]}"; do
    DEADLINE=$((SECONDS + ${SVC_TIMEOUT[$SVC]}))
    while true; do
      # ... existing status check ...
    done
  done
  ```
- Evidence: deploy.sh:75-98. Wiki: `.memory/knowledge/concepts/deploy-single-healthcheck-window.md`.

---

### [H2] Отсутствие pre-deploy backup нарушает принцип атомарности деплоя

(Уже частично описан в C4b, здесь архитектурный аспект)

- Files: `scripts/deploy.sh`:52-53
- Problem: Комментарий "backup skipped (cron handles daily at 04:00)" означает, что между двумя
  ежедневными backup'ами может пройти до 23:59 транзакций. Migration + rollback не восстанавливают
  данные — только схему. Особенно опасно для таблиц с pgcrypto-зашифрованными PII.
- Evidence: deploy.sh:52-53.

---

### [H3] Cron контейнер включает backup-db.sh и доступ к BACKUP_KEY — избыточный blast radius

- Files: `infra/docker-compose.prod.yml`:210-241
- Problem: cron-сервис имеет `BACKUP_KEY` в env и монтирует `/opt/poputchiki/backups:/backups`.
  Бизнес-логика cron (cleanup expired rides, notifications) не требует знания ключа шифрования
  backup'ов. При компрометации cron-контейнера атакующий получает доступ ко всем backup-файлам
  и ключу расшифровки — то есть ко всему PII в открытом виде.
- Why bad: Нарушение least privilege. Один контейнер имеет доступ как к живым данным (DATABASE_URL),
  так и к их зашифрованным архивам (BACKUP_KEY + /backups).
- Fix: Вынести backup-db.sh из cron-контейнера в отдельный backup-only сервис, либо запускать
  через host crontab без BACKUP_KEY в app-контейнере. Если cron должен делать backup — выделить
  отдельный cron-backup сервис без DATABASE_URL prod.
- Evidence: docker-compose.prod.yml:217-218 (`BACKUP_KEY`, `BACKUP_DIR`), :223 (volume backups).

---

### [H4] nightly.yml использует `aquasecurity/trivy-action@master` — плавающий тег, supply chain риск

- Files: `.github/workflows/nightly.yml`:34
- Problem: `@master` — не pinned версия, любое изменение в upstream репозитории немедленно
  применяется. В deploy.yml используется правильно: `@v0.36.0`. Nightly — не deploy, но он
  генерирует SARIF и загружает в GitHub Security — компрометированный action может отравить
  результаты security scanning или получить доступ к `secrets.GITHUB_TOKEN`.
- Why bad: Supply chain attack. GitHub рекомендует pin all third-party actions to a commit SHA.
- Fix:
  ```yaml
  # nightly.yml:34
  uses: aquasecurity/trivy-action@18f2135b0d79a89f782a5a5ab4b6c5c75f3d4c85  # v0.36.0
  ```
- Evidence: nightly.yml:34 vs deploy.yml:93.

---

### [H5] deploy.yml генерирует .env через pipe в SSH — secrets печатаются в GHA runner memory, не masked

- Files: `.github/workflows/deploy.yml`:134-156
- Problem: Блок `echo "KEY=VALUE"` для каждого секрета выполняется в runner process, затем
  передаётся через SSH. GitHub автоматически маскирует значения `secrets.*` в log output, но
  промежуточный heredoc-pipe может оставить traces в /proc/self/fd или в SSH debug output если
  включён `ssh -v`. Дополнительно: `SERVICE_DB_PASSWORD=` и `METRICS_TOKEN=` генерируются
  пустыми (строки 141, 147) — если приложение не валидирует их как optional, может быть сюрприз.
- Why bad: Потенциальная утечка секретов через SSH debug traces. Пустые обязательные переменные —
  silent misconfiguration. Лучший паттерн: передавать .env как GitHub secret целиком.
- Fix: Передавать .env-файл как один GitHub secret:
  ```yaml
  # Альтернатива: ssh + base64
  echo "${{ secrets.PROD_ENV_FILE }}" | \
    ssh user@host "base64 -d > /opt/poputchiki/.env && chmod 600 /opt/poputchiki/.env"
  ```
  Или использовать `scp` с временным файлом в `/run/shm/`.
- Evidence: deploy.yml:134-156.

---

### [H6] deploy.sh запускает migrations с POSTGRES_USER (superuser) — нарушает принцип least privilege

- Files: `infra/docker-compose.prod.yml`:87-88, `scripts/deploy.sh`:67
- Problem: migrations сервис использует `DATABASE_MIGRATOR_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@...`
  — то есть postgres superuser. Migrations DDL требует elevated rights, но superuser bypass RLS.
  Wiki-концепт `superuser-database-url-rls-bypass.md` зафиксировал этот риск. Идеальный паттерн —
  отдельная роль `poputchiki_migrator` с CREATEROLE + CREATEDB, но без SUPERUSER.
- Why bad: Superuser в migrations container — если container escapes, у атакующего полный доступ
  к PostgreSQL без RLS.
- Fix: Создать `poputchiki_migrator` роль с минимальными DDL-правами в 01-app-role.sql:
  ```sql
  CREATE ROLE poputchiki_migrator WITH LOGIN NOSUPERUSER CREATEDB NOCREATEROLE
    PASSWORD '${MIGRATOR_DB_PASSWORD}';
  GRANT CREATE ON SCHEMA public TO poputchiki_migrator;
  ```
  И добавить `MIGRATOR_DB_PASSWORD` в secrets.
- Evidence: docker-compose.prod.yml:87-88.

---

### [H7] Backup cron schedule mismatch — комментарий "04:00" vs фактический cron "0 1 * * *" (01:00 UTC)

- Files: `.github/workflows/deploy.yml`:173-177, `scripts/deploy.sh`:52-53
- Problem: deploy.sh:52 комментарий: "backup skipped (cron handles daily at 04:00)".
  deploy.yml:176 реальный cron: `0 1 * * *` = 01:00 UTC = 04:00 Moscow (UTC+3 зимой, UTC+3 нет DST).
  Это совпадает для Москвы, но: (a) комментарий вводит в заблуждение (пишет "04:00" без timezone),
  (b) При переходе UTC+3 (Татарстан) эффективное время backup 04:00 local — не задокументировано.
- Why bad: Операционная путаница. При инцидентах в 03:00-04:00 Moscow оператор не знает был ли backup.
- Fix: В deploy.sh:52: "backup skipped (cron: 01:00 UTC = 04:00 MSK)". В deploy.yml:176 добавить комментарий.
- Evidence: deploy.yml:176 vs deploy.sh:52.

---

### [H8] rollback.sh не обновляет last-good-tag — после rollback следующий deploy не знает "хорошую" версию

- Files: `scripts/rollback.sh`:41
- Problem: После успешного rollback записывается только `current-tag`. `last-good-tag` не обновляется.
  Следующий deploy читает `last-good-tag` как previous version для сохранения. Если rollback произошёл
  к версии X, а последний деплой к Y (неудачный), то `last-good-tag` всё ещё указывает на X — это
  верно. Но если rollback вызван несколько раз подряд или вручную с другим тегом, инвариант нарушается.
  Серьёзнее: rollback.sh:12 читает `last-good-tag` (не `current-tag`) — то есть rollback всегда
  откатывается на два шага назад если файлы не в синхронизированном состоянии.
- Why bad: Сложная state machine с файловыми флагами без атомарности. При параллельном deploy/rollback
  (маловероятно, concurrency: cancel-in-progress: false, но теоретически) гонка файлов.
- Fix: После успешного rollback обновлять оба файла:
  ```bash
  echo "$TARGET_TAG" > "$STATE_DIR/current-tag"
  echo "$TARGET_TAG" > "$STATE_DIR/last-good-tag"  # rollback сам стал "last good"
  ```
- Evidence: rollback.sh:41-42, deploy.sh:102-103.

---

## Medium

### [M1] docker-compose.dev.yml — postgres порт открыт наружу без ограничения хоста

- Files: `infra/docker-compose.dev.yml`:10
- Problem: `ports: - "${POSTGRES_PORT:-5432}:5432"` — binds на 0.0.0.0 по умолчанию. В dev-среде
  на VPS или при случайном деплое prod файла postgres будет доступен извне.
- Fix: `- "127.0.0.1:${POSTGRES_PORT:-5432}:5432"` — bind только на localhost.
- Evidence: docker-compose.dev.yml:10.

---

### [M2] Нет resource limits для postgres в dev compose, nominatim без limits везде

- Files: `infra/docker-compose.dev.yml`, `infra/docker-compose.prod.yml`:296-316
- Problem: docker-compose.dev.yml не имеет `deploy.resources.limits` для postgres. В prod
  nominatim имеет `memory: 2g` — но это минимум для Nominatim с PBF Татарстана (~300MB PBF).
  При PBF import (30 min first run) Nominatim может потреблять значительно больше 2GB RAM.
- Why bad: OOM killer может убить Nominatim во время импорта, оставив corrupt nominatim-data volume.
- Fix: `memory: 4g` для nominatim во время импорта, или documented restart procedure при OOM.
- Evidence: docker-compose.prod.yml:314-316.

---

### [M3] check-coverage.js — threshold для branches ниже чем в vitest.config.ts

- Files: `scripts/check-coverage.js`:6, `vitest.config.ts`:28-33
- Problem: vitest.config.ts задаёт `branches: 95`, но check-coverage.js:6:
  `THRESHOLDS = { lines: 95, branches: 90, functions: 95, statements: 95 }`.
  Branches threshold в скрипте = 90% vs 95% в vitest config. Правило проекта: 95% everywhere.
  Двойной стандарт создаёт false green если vitest threshold не сработал (например, при `--passWithNoTests`).
- Why bad: CI может пропустить PR с branch coverage 91% — оба скрипта дают green, реальный threshold нарушен.
- Fix: check-coverage.js:6 — `branches: 95`.
- Evidence: check-coverage.js:6, vitest.config.ts:30.

---

### [M4] deploy.sh — awk image cleanup может удалить текущий SHA образ

- Files: `scripts/deploy.sh`:107-114
- Problem: KEEP_TAG читается из `last-good-tag` (предыдущая версия). `head -n -5` сохраняет 5 самых
  новых образов не-KEEP_TAG. Если на сервере было <5 образов до деплоя, новый SHA ($SHA) может
  оказаться в "delete" списке т.к. awk фильтрует только KEEP_TAG, а не текущий SHA.
  Точнее: сортировка по тегу (sort -k2), head -n -5 удаляет всё кроме 5 последних (по алфавиту тега).
  SHA теги — hex строки, алфавитная сортировка != хронологическая. Свежий SHA может оказаться
  в первых позициях и попасть под удаление.
- Why bad: Текущая работающая версия удаляется из docker images. При следующем рестарте контейнера
  образ не найден — outage.
- Fix: Добавить текущий SHA в явный keep list:
  ```bash
  | awk -v keep="$KEEP_TAG" -v cur="$SHA" '$2 != keep && $2 != cur && $2 != "latest"'
  ```
- Evidence: deploy.sh:107-114.

---

### [M5] Loki конфиг использует устаревший boltdb-shipper (deprecated в Loki 2.8+)

- Files: `infra/loki/config.yml`:17-27
- Problem: `store: boltdb-shipper` deprecated с Loki 2.8, заменён на `tsdb`. Образ `grafana/loki:2.9.8`
  уже поддерживает tsdb. boltdb-shipper показывает warnings в логах и будет удалён в Loki 3.x.
- Fix:
  ```yaml
  schema_config:
    configs:
      - from: 2024-01-01
        store: tsdb
        object_store: filesystem
        schema: v13
  ```
- Evidence: infra/loki/config.yml:17-19.

---

### [M6] Grafana — нет provisioned dashboards в репо, только datasources

- Files: `infra/grafana/provisioning/dashboards/` (пустая директория)
- Problem: Grafana provisioning/dashboards/ пустая. Grafana стартует без dashboards — оператор
  видит пустой UI. Нет готовых dashboards для node_exporter, cadvisor, postgres-exporter — которые
  уже скрейпятся Prometheus. Dashboards создаются вручную в UI и хранятся только в grafana-data volume.
- Why bad: Потеря dashboards при пересоздании grafana-data volume (rollback, disaster recovery).
  Observability stack не self-healing.
- Fix: Добавить provisioned dashboards (JSON) для node/postgres/cadvisor + dashboard.yml:
  ```yaml
  # provisioning/dashboards/dashboard.yml
  apiVersion: 1
  providers:
    - name: default
      folder: Poputchiki
      type: file
      options:
        path: /etc/grafana/provisioning/dashboards
  ```
- Evidence: infra/grafana/provisioning/dashboards/ — пустая.

---

### [M7] restore-test.sh — pg_restore с `|| true` скрывает ошибки восстановления

- Files: `scripts/restore-test.sh`:45
- Problem: `pg_restore ... 2>/dev/null || true` — любая ошибка pg_restore (corrupt dump,
  incompatible schema, insufficient permissions) игнорируется. Smoke-тест `COUNT(*) FROM users`
  может вернуть 0 (пустая БД) даже при ошибке restore — скрипт выведет `RESTORE_TEST_OK users=0`.
- Why bad: restore-test даёт false positive при реальном сбое восстановления. Backup проходит,
  restore-test проходит, но в момент real disaster recovery БД не восстанавливается.
- Fix:
  ```bash
  pg_restore -d "$RESTORE_URL" --no-owner --no-privileges -j 2 "$TMPFILE" 2>&1 | tee /tmp/restore.log
  RC=${PIPESTATUS[0]}
  if [[ $RC -ne 0 ]]; then
    echo "RESTORE_TEST_FAIL: pg_restore exited $RC" >&2; cat /tmp/restore.log >&2; exit 1
  fi
  ```
  И добавить проверку: `USERS > 0` обязательно если БД не пустая.
- Evidence: restore-test.sh:45.

---

### [M8] setup-tg-webhook.sh и setup-webhook.sh — дублирование с расхождением в URL и allowed_updates

- Files: `scripts/setup-tg-webhook.sh`, `scripts/setup-webhook.sh`
- Problem: Два скрипта для одной операции с разными URL:
  - setup-tg-webhook.sh:8: `https://webhook.${DOMAIN}/tg/webhook`
  - setup-webhook.sh:9: `https://webhook.${DOMAIN}/webhook/tg`
  Разные пути — один из них неверен. Также разные `allowed_updates`:
  - setup-tg-webhook.sh: `my_chat_member,message`
  - setup-webhook.sh: `message,callback_query,inline_query`
  `callback_query` критичен для кнопок "Принять"/"Отклонить".
- Why bad: Оператор запустит не тот скрипт и webhook не будет получать callback_query.
- Fix: Удалить setup-tg-webhook.sh (или пометить deprecated), оставить setup-webhook.sh с
  правильными allowed_updates. Унифицировать URL.
- Evidence: setup-tg-webhook.sh:8 vs setup-webhook.sh:9, allowed_updates.

---

### [M9] Prometheus — нет alerting rules, Alertmanager не настроен

- Files: `infra/prometheus/prometheus.yml`
- Problem: Prometheus скрейпит 5 targets (node, postgres, cadvisor, api, prometheus-self) но
  `rule_files:` отсутствует. Нет rules для: высокого CPU, OOM (container_memory_usage_bytes > limit),
  postgres connections near max_connections (200), disk fill rate. Alertmanager не запущен в observability compose.
- Why bad: Prometheus без alerts — только красивые графики. При приближении к лимиту 200 connections
  (50k users) никто не узнает до outage.
- Fix: Добавить `rule_files: [/etc/prometheus/alerts.yml]` и базовые alerts:
  ```yaml
  groups:
    - name: poputchiki
      rules:
        - alert: PostgresConnectionsHigh
          expr: pg_stat_activity_count > 180
          for: 2m
        - alert: ContainerOOMKilled
          expr: container_oom_events_total > 0
          for: 0m
  ```
- Evidence: prometheus.yml — нет `rule_files` и `alerting` секций.

---

### [M10] apps/cron/Dockerfile — использует `oven/bun:1` (Debian, не alpine), остальные сервисы на alpine

- Files: `apps/cron/Dockerfile`:1
- Problem: `FROM oven/bun:1` — полный Debian образ, ~800MB. Все остальные Dockerfiles (`oven/bun:1-alpine`)
  — Alpine-based, ~150MB. cron устанавливает postgresql-client, zstd, gnupg через apt — это
  понятно (backup tools). Но базовый образ следовало бы тоже сделать alpine + apk.
- Why bad: Inconsistency. Больший attack surface через Debian пакеты. Больший image size — медленнее pull.
- Fix:
  ```dockerfile
  FROM oven/bun:1-alpine AS base
  RUN apk add --no-cache postgresql16-client zstd gnupg tini curl
  ```
  Проверить совместимость backup-db.sh с Alpine's pg_dump.
- Evidence: apps/cron/Dockerfile:1 vs apps/api/Dockerfile:1 (`oven/bun:1-alpine`).

---

## Low

### [L1] apps/web-server/Dockerfile — не задан USER, контейнер работает от root

- Files: `apps/web-server/Dockerfile`:22
- Problem: Caddy stage не имеет `USER`. По умолчанию `caddy:2-alpine` запускается от root (PID 1).
  Caddy требует root для bind :80 и :443, но в этом случае Traefik handles TLS — Caddy слушает
  только :80 внутри сети. Можно запустить от non-root пользователя с capability NET_BIND_SERVICE
  или изменить порт на >1024.
- Fix: Добавить перед `EXPOSE 80`:
  ```dockerfile
  RUN addgroup -S caddy && adduser -S -G caddy caddy
  USER caddy
  EXPOSE 8080
  ```
  И поменять порт в compose label на 8080.
- Evidence: apps/web-server/Dockerfile — нет USER строки.

---

### [L2] notifier/Dockerfile — не копирует db/ директорию, но api/Dockerfile её копирует

- Files: `apps/notifier/Dockerfile`, `apps/api/Dockerfile`:14
- Problem: api/Dockerfile:14 копирует `COPY --chown=bun:bun db db` — notifier не копирует.
  Если notifier когда-либо будет использовать db/migrations (для migrate-on-start паттерна) или
  db/schema файлы — образ будет broken. Сейчас не критично, но несоответствие между сервисами.
- Evidence: apps/notifier/Dockerfile — нет `COPY db db`.

---

### [L3] lefthook.yml — `bun audit` в pre-commit без `--audit-level` может блокировать на minor/info уязвимостях

- Files: `lefthook.yml`:5
- Problem: `run: bun audit` без `--audit-level` — будет блокировать commit при любой уязвимости,
  включая low/info severity. В CI (audit job) используется `bun audit --audit-level high`.
  Несоответствие создаёт ситуацию: devops не может сделать commit из-за minor уязвимости,
  которую CI допускает.
- Fix:
  ```yaml
  run: bun audit --audit-level high
  ```
- Evidence: lefthook.yml:5 vs ci.yml:177 (`bun audit --audit-level high`).

---

### [L4] nightly.yml — ZAP baseline сканирует только `/health` endpoint API, не API роуты

- Files: `.github/workflows/nightly.yml`:58
- Problem: `target: "https://api.${DOMAIN}/health"` — ZAP crawls от /health. Authenticated
  routes (`/rides`, `/users`, `/internal/*`) не сканируются. fail_action: false — даже если
  ZAP находит проблемы, deploy не блокируется.
- Why bad: ZAP baseline — checkbox без реальной пользы. Не тестирует auth bypass, injection
  в ride parameters, IDOR в /rides/:id.
- Fix: Добавить ZAP context с auth для базового сканирования auth-protected endpoints, или
  переключить `fail_action: true` хотя бы для критических alerts. Как минимум расширить target
  до нескольких endpoints.
- Evidence: nightly.yml:57-62.

---

### [L5] rollback.sh — комментарий первой строки на украинском ("попередній")

- Files: `scripts/rollback.sh`:2
- Problem: `# Rollback на попередній тег або вказаний` — "попередній" украинский. Весь проект
  ведётся на русском (CLAUDE.md). Остальные скрипты — русский (deploy.sh: "атомарный деплой",
  backup-db.sh: "резервное копирование").
- Fix: `# Rollback: переключение на предыдущий тег или указанный`
- Evidence: rollback.sh:2.

---

### [L6] docker-compose.dev.yml — нет `name:` для сети poputchiki-dev

- Files: `infra/docker-compose.dev.yml`:38-40
- Problem: Compose файл запускается как `docker compose -f infra/docker-compose.dev.yml`, поэтому
  project name будет `infra` (из папки файла). Сеть получит имя `infra_poputchiki-dev` вместо
  `poputchiki-dev`. В продакшне эта проблема решена (name: poputchiki-internal). В dev важно для
  отладки и для случаев когда observability compose хочет присоединиться к dev-сети.
- Fix:
  ```yaml
  networks:
    poputchiki-dev:
      driver: bridge
      name: poputchiki-dev
  ```
- Evidence: docker-compose.dev.yml:38-40. Wiki: concepts/docker-compose-network-prefix (via be20807 fix).

---

## Notes (informational, не blocking)

### [N1] Traefik использует `traefik:latest` — floating tag в production

- Files: `infra/docker-compose.prod.yml`:11
- Context: Pinned до `traefik:v3.3` был несовместим с Docker 29 (API compat issue, commit 0027219).
  `latest` — workaround. Рекомендуется при стабилизации Docker версии вернуться к pinned тегу.
- Evidence: docker-compose.prod.yml:11, git log: `0027219 FIX: обновить traefik:v3.3 до traefik:latest`.

### [N2] Устаревшая роль `app` в 01-app-role.sql создаётся при каждом init

- Files: `infra/postgres/init/01-app-role.sql`:62-68
- Context: Роль `app` помечена DEPRECATED, но всё равно создаётся. При следующем major init-refactor
  стоит убрать, чтобы не плодить мёртвые роли.
- Evidence: 01-app-role.sql:62-68.

### [N3] uptime-kuma:1 — floating major tag

- Files: `infra/docker-compose.observability.yml`:61
- Context: `louislam/uptime-kuma:1` — major tag без minor/patch pinning. При major bump может
  получить несовместимое обновление.
- Evidence: docker-compose.observability.yml:61.
