# apps/notifier

Фоновый процесс push-уведомлений. Нет HTTP-интерфейса.

## Принцип работы

```
Postgres NOTIFY notify_user '{"user_id":42,"text":"Водитель подтвердил вашу заявку"}'
         │
         ▼
notifier: LISTEN notify_user
         │
         ▼
Telegram Bot API: sendMessage(chat_id=tg_id, text=...)
```

API пишет в канал `notify_user` через `pg_notify()` после ключевых событий:
- подтверждение заявки на поездку
- отклонение заявки
- отмена поездки водителем
- новый участник (для водителя)

## Circuit breaker

5 последовательных сбоев при обращении к Telegram Bot API → пауза 30 секунд. Защита от каскадных сбоев при недоступности Telegram.

## Переменные окружения

`DATABASE_URL`, `BOT_TOKEN`, `LOG_LEVEL`

## Одно соединение

Notifier держит ровно 1 `LISTEN`-соединение к Postgres (не через пул). Это требование postgres.js для `LISTEN/NOTIFY`.
