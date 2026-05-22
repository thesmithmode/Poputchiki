# UNNEST multi-column alias — только имена, без типов

## Суть

В `FROM UNNEST(...) AS t(col1, col2)` алиас содержит **только имена столбцов**, без типов. Указание типов — синтаксическая ошибка.

## Пример

```sql
-- ОШИБКА (syntax error at or near "uuid"):
FROM UNNEST($1::uuid[], $2::text[]) AS t(id uuid, status text)

-- ПРАВИЛЬНО:
FROM UNNEST($1::uuid[], $2::text[]) AS t(id, status)
```

Типы уже закодированы в cast-выражениях (`::uuid[]`, `::text[]`) — Postgres выводит их из них. Повторно указывать типы в алиасе запрещено синтаксически.

## Контекст появления

Ошибка возникла при реализации `enqueueNotificationBatch` — UNNEST INSERT для batch-нотификаций. CI упал с `syntax error`, локальная Postgres выдала то же. Исправление: убрать типы из алиаса, оставить только имена.

## Связанные статьи

- [[concepts/unnest-batch-update]] — тот же паттерн для UPDATE
- [[concepts/enqueue-notification-batch]] — batch-нотификации через UNNEST INSERT
