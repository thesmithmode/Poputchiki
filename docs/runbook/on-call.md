# On-Call Runbook

## Уровни инцидентов

| Уровень | Описание | SLA ответа |
|---------|----------|------------|
| P1 | Production полностью недоступен | 15 мин |
| P2 | Деградация (часть функций не работает) | 1 час |
| P3 | Предупреждение (медленно, ошибки в логах) | 8 часов |

## Чеклист первого реагирования

1. Проверить health endpoint:
   ```bash
   curl -sf https://api.poputchiki.searchingforgamesforever.online/health
   curl -sf https://app.poputchiki.searchingforgamesforever.online/
   ```
2. Проверить контейнеры:
   ```bash
   ssh user@host "docker ps --format 'table {{.Names}}\t{{.Status}}'"
   ```
3. Посмотреть логи упавшего сервиса:
   ```bash
   ssh user@host "docker logs --tail=100 poputchiki-api-1"
   ```
4. Проверить ресурсы:
   ```bash
   ssh user@host "docker stats --no-stream"
   ```
5. Если сервис упал — перезапустить:
   ```bash
   ssh user@host "docker compose -f /opt/poputchiki/infra/docker-compose.prod.yml restart api"
   ```
6. Если не помогло — откатить: см. `deploy-rollback.md`

## Полезные команды

```bash
# Логи конкретного сервиса (последние 200 строк)
docker logs --tail=200 poputchiki-api-1
docker logs --tail=200 poputchiki-notifier-1

# Следить за логами в реальном времени
docker logs -f poputchiki-api-1

# Статус всех контейнеров
docker ps -a

# Использование ресурсов
docker stats --no-stream

# Место на диске
df -h /opt/poputchiki

# Проверить подключения к БД
docker exec poputchiki-postgres-1 psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"

# Health endpoint с деталями
curl -s https://api.poputchiki.searchingforgamesforever.online/health | jq .
```

## Эскалация

P1/P2: Telegram → @thesmithmode (немедленно)
P3: записать в лог, решить в рабочее время
