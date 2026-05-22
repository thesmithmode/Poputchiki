---
title: "Crash-Loop Container Detection — диагностика по docker ps uptime"
aliases: [crash-loop-detection, container-restart-loop, docker-uptime-diagnosis]
tags: [docker, devops, diagnostics, notifier, gotcha]
sources:
  - "daily/2026-05-21.md"
created: 2026-05-21
updated: 2026-05-21
---

# Crash-Loop Container Detection — диагностика по docker ps uptime

`docker ps` с коротким uptime (`Up 25s`) при соседях с `Up 9h` / `Up 7d` — первый признак crash-loop. Молчаливый failure pattern: crash-loop notifier не ломает SSE (apps/api обрабатывает его независимо), но TG bot-уведомления перестают приходить — симптом «бот молчит», не «приложение сломано».

## Key Points

- Первый диагностический сигнал: `docker ps` → один контейнер с коротким uptime, остальные с нормальным
- Notifier в crash-loop: SSE работает (api-service независим), TG-нотификации молчат — баг выглядит как «бот не отвечает», не как «SSE упал»
- Имя контейнера зависит от Docker Compose project name: `infra-notifier-1` если `name: infra` в docker-compose.yml, не `poputchiki-notifier-1`
- `docker logs <container> --tail 50` для быстрой проверки причины рестарта
- Restart policy `unless-stopped` маскирует crash-loop — контейнер выглядит «Up», но перезапускается постоянно

## Details

Команда для первичного осмотра:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"
```

Вывод при crash-loop выглядит примерно так:

```
NAMES                  STATUS          IMAGE
infra-api-1            Up 9 hours      ghcr.io/.../api:sha
infra-postgres-1       Up 7 days       postgres:16-alpine
infra-notifier-1       Up 25 seconds   ghcr.io/.../notifier:sha   ← crash-loop
infra-cron-1           Up 9 hours      ghcr.io/.../cron:sha
```

Следующий шаг — проверить логи до краша:

```bash
docker logs infra-notifier-1 --tail 100
# или посмотреть исторические логи (если logging настроен)
docker logs infra-notifier-1 --since "2h" 2>&1 | tail -50
```

**Почему crash-loop notifier незаметен в приложении:**
`apps/notifier` получает Postgres `LISTEN/NOTIFY` события и рассылает TG-уведомления. SSE-поток обслуживается напрямую через `apps/api` (Hono SSE endpoint + собственный LISTEN), поэтому crash notifier = только TG-нотификации молчат. Пользователи видят in-app уведомления через SSE, но в Telegram — тишина. Баг выглядит как проблема Telegram, а не как crash приложения.

**Docker Compose project name и имена контейнеров:**
Имя контейнера = `<project>-<service>-<replica>`. Project задаётся через `name:` в верхнем уровне docker-compose.yml:

```yaml
name: infra  # → infra-notifier-1
```

Без `name:` Compose использует имя директории (`poputchiki-notifier-1` если директория `poputchiki`). При SSH-диагностике важно знать правильное имя — `docker logs poputchiki-notifier-1` на prod может вернуть ошибку, если project name `infra`.

**Restart count в docker inspect:**

```bash
docker inspect infra-notifier-1 | grep -A2 '"RestartCount"'
# "RestartCount": 47  → явный признак crash-loop
```

## Related Concepts

- [[concepts/postgres-js-listen-once-semantics]] — Root cause конкретного crash-loop: неправильный reconnect wrapper поверх sql.listen()
- [[concepts/docker-compose-network-prefix]] — Docker Compose project name влияет и на имена сетей, и на имена контейнеров
- [[concepts/pg-notify-single-channel]] — Что теряется при crash notifier: fan-out TG-нотификаций

## Sources

- [[daily/2026-05-21.md]] — Диагностика crash-loop notifier: `docker ps` показал `Up 25s` у infra-notifier-1; commit 9a6a184 как причина; TG bot-нотификации молчали при живом SSE; project name `infra` определял имя контейнера
