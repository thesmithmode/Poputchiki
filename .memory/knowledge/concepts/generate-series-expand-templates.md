---
title: "GENERATE_SERIES для expand_templates — SQL вместо вложенных циклов приложения"
aliases: [generate-series-expand, expand-templates-sql, generate-series-insert-select]
tags: [database, postgresql, performance, cron, pattern]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# GENERATE_SERIES для expand_templates — SQL вместо вложенных циклов приложения

Замена вложенных циклов на уровне приложения для генерации временных рядов одним SQL-оператором `INSERT ... SELECT ... GENERATE_SERIES ON CONFLICT DO NOTHING`. Для `expand_templates`: вместо вложенных циклов (2000 пользователей × 3 шаблона × 30 дней = 180k await'ов) все даты генерируются внутри SQL через GENERATE_SERIES, фильтрация по дням недели — тоже в запросе.

## Ключевая идея

Postgres выполняет генерацию, фильтрацию и дедупликацию внутри одного оператора. Приложение не загружает данные в память. Нет вложенных циклов. Нет transaction risk для 180k строк.

## Антипаттерн

```typescript
// НЕПРАВИЛЬНО: вложенные циклы, 180k await'ов
const templates = await sql`SELECT * FROM ride_templates WHERE active = true`;
const dates = next30Days(); // массив из 30 дат

for (const template of templates) {
  for (const date of dates) {
    if (template.weekdays.includes(date.getDay())) {
      await sql.begin(async tx => {
        await tx`
          INSERT INTO rides (template_id, driver_id, departure_at, ...)
          SELECT ... WHERE NOT EXISTS (
            SELECT 1 FROM rides WHERE template_id = ${template.id} AND departure_at = ${date}
          )
        `;
      });
    }
  }
}
```

## Правильный паттерн

```sql
INSERT INTO rides (template_id, driver_id, departure_at, from_lat, from_lon, to_lat, to_lon, seats_total, price)
SELECT
  t.id,
  t.driver_id,
  d::timestamptz + t.departure_time,
  t.from_lat,
  t.from_lon,
  t.to_lat,
  t.to_lon,
  t.seats_total,
  t.price
FROM ride_templates t
CROSS JOIN GENERATE_SERIES(
  NOW()::date,
  NOW()::date + INTERVAL '30 days',
  '1 day'::interval
) AS d
WHERE
  EXTRACT(DOW FROM d) = ANY(t.weekdays)
  AND t.active = true
ON CONFLICT (template_id, departure_at) WHERE template_id IS NOT NULL DO NOTHING
```

## Критический элемент: уникальный частичный индекс

`ON CONFLICT` без индекса не работает. Необходим уникальный частичный индекс (миграция 033):

```sql
CREATE UNIQUE INDEX rides_template_departure_uniq
  ON rides (template_id, departure_at)
  WHERE template_id IS NOT NULL;
```

Условие `WHERE template_id IS NOT NULL` исключает вручную созданные поездки без шаблона — они могут иметь одинаковое время, и конфликта быть не должно.

## Фильтрация по дням недели внутри SQL

```sql
-- EXTRACT(DOW FROM d): 0=воскресенье, 1=понедельник, ..., 6=суббота
-- t.weekdays: int[] — массив допустимых дней недели из шаблона
WHERE EXTRACT(DOW FROM d) = ANY(t.weekdays)
```

Вся бизнес-логика (какой день недели разрешён) остаётся в БД, не в приложении.

## Идемпотентность

`ON CONFLICT DO NOTHING` → повторный запуск cron безопасен. Уже созданные поездки пропускаются без ошибки. Частичный индекс гарантирует уникальность по `(template_id, departure_at)` для шаблонных поездок.

## Результат

- 180,000 await'ов → 1 SQL-оператор
- Нет риска lock timeout (одна быстрая INSERT ... SELECT)
- Нет загрузки данных в память приложения
- Weekday-фильтр и дедупликация — на стороне Postgres

## Related Concepts

- [[concepts/bulk-insert-transaction-risk]] — решение проблемы: GENERATE_SERIES в одном SQL вместо 180k транзакций
- [[concepts/cron-startup-vs-scheduled-trap]] — expand_templates вызывается при старте и по расписанию
- [[concepts/on-conflict-constraint-pitfall]] — ON CONFLICT требует уникального constraint/индекса

## Sources

- [[daily/2026-05-22.md]] — Session 18:15: expand_templates рефакторинг — вложенные циклы 150k×await → единый INSERT...SELECT...GENERATE_SERIES ON CONFLICT DO NOTHING; уникальный частичный индекс rides(template_id, departure_at) добавлен в миграции 033
