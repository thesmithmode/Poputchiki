# Pre-Launch Checklist — Poputchiki

## Инфраструктура

- [ ] DNS: `api.`, `app.`, `webhook.`, `grafana.`, `status.` резолвятся на IP сервера
- [ ] Traefik запущен, Let's Encrypt сертификаты получены для всех поддоменов
- [ ] `scripts/preflight.sh` выполнен без FAIL
- [ ] `/opt/poputchiki/.env` заполнен всеми секретами (POSTGRES_PASSWORD, JWT_SECRET, BOT_TOKEN, BACKUP_KEY, PGCRYPTO_KEY, WEBHOOK_SECRET)
- [ ] `/opt/poputchiki/backups/` создана и доступна для записи
- [ ] Свободного места на диске ≥10GB

## База данных

- [ ] PostgreSQL запущен: `docker compose exec postgres pg_isready`
- [ ] Все миграции применены: `docker compose run --rm api bun run migrate`
- [ ] Роль `app` создана (init-скрипт отработал при первом старте)
- [ ] pgcrypto extension установлена: `SELECT * FROM pg_extension WHERE extname='pgcrypto'`
- [ ] RLS включён на таблицах users, rides, trip_requests

## Приложение

- [ ] `docker compose -f infra/docker-compose.prod.yml up -d` — все сервисы healthy
- [ ] `curl -sf https://api.poputchiki.searchingforgamesforever.online/health` → 200
- [ ] `curl -sf https://app.poputchiki.searchingforgamesforever.online/` → 200
- [ ] `curl -sf https://webhook.poputchiki.searchingforgamesforever.online/health` → 200

## Telegram Bot

- [ ] `scripts/setup-webhook.sh` выполнен — webhook зарегистрирован
- [ ] `curl https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo` — url заполнен, pending_update_count=0
- [ ] Тест: отправить `/start` боту — ответ получен

## Безопасность

- [ ] Все эндпоинты API за JWT (кроме /health, /auth/*, /client-errors)
- [ ] RLS проверён: запрос от user_id=1 не видит данные user_id=2
- [ ] `BOT_TOKEN` не фигурирует в логах (`docker compose logs api | grep -v REDACTED | grep -i token` — пусто)
- [ ] HTTPS везде, HTTP → HTTPS редирект работает
- [ ] Rate limiting активен: 100 req/min на /auth/login

## Бэкап

- [ ] Ручной тест бэкапа: `docker exec poputchiki-cron-1 bash scripts/backup-db.sh` → ok
- [ ] Файл появился в `/opt/poputchiki/backups/`
- [ ] Ручной тест восстановления: `docker exec poputchiki-cron-1 bash scripts/restore-test.sh` → ok

## CI/CD

- [ ] `deploy.yml` workflow выполнился успешно хотя бы раз (можно через workflow_dispatch)
- [ ] Rollback проверен: `scripts/rollback.sh` отрабатывает без ошибок
- [ ] `/opt/poputchiki/last-good-tag` существует после успешного деплоя

## Observability (опционально)

- [ ] `docker compose -f infra/docker-compose.observability.yml up -d` — сервисы запущены
- [ ] Grafana доступна на https://grafana.poputchiki.searchingforgamesforever.online
- [ ] Uptime Kuma на https://status.poputchiki.searchingforgamesforever.online
- [ ] Prometheus scrape targets: все UP

## Go-Live

- [ ] Все пункты выше закрыты
- [ ] Уведомить пользователей (Telegram канал ЖК)
- [ ] Включить мониторинг в Uptime Kuma для api/app/webhook
- [ ] Установить алерты в Grafana на CPU>80%, RAM>80%, error rate>1%
