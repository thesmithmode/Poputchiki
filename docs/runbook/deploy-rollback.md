# Deploy & Rollback

## Обычный деплой

Push в `main` → GitHub Actions запускает `deploy.yml` автоматически.

Процесс GHA:
1. Build Docker images → push в GHCR
2. SSH на сервер → `scripts/deploy.sh ${SHA}`
3. Backup pre-deploy → migrate → `docker compose up -d`
4. Smoke test `/health` → rollback при fail

## Ручной деплой

```bash
# Указать конкретный SHA коммита
ssh user@host "bash /opt/poputchiki/scripts/deploy.sh abc1234"
```

SHA берётся из `git log --oneline` или из GHA run.

## Откат

```bash
ssh user@host "bash /opt/poputchiki/scripts/rollback.sh"
```

Скрипт читает `/opt/poputchiki/last-good-tag` и поднимает предыдущую версию образов.
После rollback — обязательно создать issue/TASK с root cause.

## Проверка текущей версии

```bash
ssh user@host "cat /opt/poputchiki/current-tag"
```

## Smoke тесты после деплоя

```bash
# API health
curl -sf https://api.poputchiki.searchingforgamesforever.online/health

# Frontend доступен
curl -sf -o /dev/null -w "%{http_code}" https://app.poputchiki.searchingforgamesforever.online/

# Webhook
curl -sf https://webhook.poputchiki.searchingforgamesforever.online/health
```

Все должны вернуть 200. Любой non-200 → откатить немедленно.

## Статус контейнеров после деплоя

```bash
ssh user@host "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

Ожидаемые контейнеры: `api`, `notifier`, `cron`, `webhook`, `web-server`, `postgres`, `nominatim`.

## Если деплой завис в GHA

```bash
# Отменить зависший run
gh run cancel <run-id> -R thesmithmode/Poputchiki

# Запустить повторно
gh run rerun <run-id> -R thesmithmode/Poputchiki
```
