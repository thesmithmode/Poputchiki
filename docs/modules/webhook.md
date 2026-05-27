# apps/webhook

Принимает апдейты от Telegram Bot API. Hono + Bun, порт 3001.

## Эндпоинты

| Метод | Путь | Назначение |
|-------|------|-----------|
| POST | /webhook/tg | основной webhook-эндпоинт |
| POST | /tg/webhook | legacy alias |
| GET | /health | liveness probe |

## Безопасность

Каждый запрос проверяет заголовок `X-Telegram-Bot-Api-Secret-Token`. Если не совпадает с `WEBHOOK_SECRET` из env → 403. Telegram передаёт этот заголовок если он был указан при регистрации webhook (`scripts/setup-webhook.sh`).

## Дедупликация

LRU-кэш по `update_id`. Telegram может прислать один апдейт несколько раз — повторные обрабатываются как no-op.

## Обрабатываемые типы апдейтов

- `message` — команды бота (/start, /help), текстовые сообщения
- `callback_query` — нажатия inline-кнопок
- `my_chat_member` — изменение статуса бота в чате

## Регистрация

```bash
BOT_TOKEN=... WEBHOOK_SECRET=... DOMAIN=... bash scripts/setup-webhook.sh
```

Выполняется один раз при деплое. Проверить статус: `curl https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`.

## Переменные окружения

`DATABASE_URL`, `BOT_TOKEN`, `WEBHOOK_SECRET`, `DOMAIN`, `WEBHOOK_PORT` (default: 3001)
