---
title: "Bulk INSERT в одной транзакции: риск lock timeout и полного отката"
aliases: [bulk-insert-risk, large-transaction-risk, batch-insert, expand-batch]
tags: [database, postgresql, performance, concurrency, gotcha]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---



# Bulk INSERT в одной транзакции: риск lock timeout и полного отката

Вставка большого числа строк в одной транзакции занимает минуты → высокий риск lock timeout, connection drop, или OOM → полный откат всей работы. Результат: 0 вставленных строк вместо частичного успеха.

## Масштаб проблемы в Poputchiki

`expand_templates`: 2000 пользователей × 3 шаблона × 30 дней = **180,000 INSERT'ов**.

Одна транзакция на 180k строк:
- Время выполнения: несколько минут
- За это время: lock timeout, connection pool eviction, или network drop → `ROLLBACK` всего
- Следующий запуск: через час (по расписанию) → снова 0 строк

Нет WAL-предупреждения, нет ошибки в логах приложения — только полный откат.

## Антипаттерн

```typescript
// НЕПРАВИЛЬНО: все 180k INSERT'ов в одной транзакции
await sql.begin(async (tx) => {
  for (const template of allTemplates) {
    for (const date of next30Days) {
      await tx`INSERT INTO rides (...) VALUES (...)`;
    }
  }
});
```

## Правильный паттерн: батчинг по шаблону/дате

```typescript
// ПРАВИЛЬНО: одна транзакция на один шаблон × один день
for (const template of allTemplates) {
  for (const date of next30Days) {
    await sql.begin(async (tx) => {
      // Проверка дубликата + INSERT в одной маленькой транзакции
      await tx`
        INSERT INTO rides (...)
        SELECT ... WHERE NOT EXISTS (
          SELECT 1 FROM rides WHERE template_id = ${template.id} AND depart_at = ${date}
        )
      `;
    });
  }
}
```

Каждая транзакция — атомарная, быстрая, идемпотентная. Краш на середине → следующий запуск продолжает с того места где остановился (благодаря `WHERE NOT EXISTS`).

## Батчинг по chunk'ам

Альтернативно — батчи по 100-500 строк с промежуточными commit'ами:

```typescript
const BATCH_SIZE = 500;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  await sql`INSERT INTO rides ${sql(batch)}`;
  // commit после каждого батча
}
```

## Идемпотентность критична

Батчинг без идемпотентности → дубликаты при повторном запуске. Обязательно:
- `WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING` (только если есть unique constraint)
- `ON CONFLICT (template_id, depart_at) DO NOTHING`

## Related Concepts

- [[concepts/cron-startup-vs-scheduled-trap]] - expand_templates батчинг — отдельная задача от fix UTCHour guard
- [[concepts/on-conflict-constraint-pitfall]] - `ON CONFLICT DO NOTHING` без unique constraint молча вставляет дубликаты
- [[concepts/advisory-lock-pool-safety]] - Advisory lock предотвращает параллельный expand, но не защищает от partial failure внутри транзакции

## Решение для expand_templates: единый SQL с GENERATE_SERIES

Финальное решение для Poputchiki — не батчинг по шаблону/дате (как планировалось), а **один SQL-оператор** с GENERATE_SERIES, который генерирует все строки атомарно внутри Postgres:

```sql
INSERT INTO rides (template_id, driver_id, departure_at, ...)
SELECT
  t.id,
  t.driver_id,
  d::timestamptz + t.departure_time,
  ...
FROM ride_templates t
CROSS JOIN GENERATE_SERIES(NOW()::date, NOW()::date + INTERVAL '30 days', '1 day'::interval) AS d
WHERE
  EXTRACT(DOW FROM d) = ANY(t.weekdays)
  AND t.active = true
ON CONFLICT (template_id, departure_at) WHERE template_id IS NOT NULL DO NOTHING
```

Это полностью избегает проблему "большой транзакции": Postgres выполняет генерацию, фильтрацию и дедупликацию внутренне без циклов на стороне приложения. Уникальный частичный индекс `rides(template_id, departure_at) WHERE template_id IS NOT NULL` обеспечивает идемпотентность через `ON CONFLICT DO NOTHING`.

Подробнее: [[concepts/generate-series-expand-templates]]

## Sources

- [[daily/2026-05-22.md]] - Session 17:49: 2000 юзеров × 3 шаблона × 30 дней = 180k INSERT'ов. Одна транзакция = минуты → lock timeout / connection drop → полный откат. Батчевый expand под хайлоад — отдельная задача.
- [[daily/2026-05-22.md]] - Session 18:15: expand_templates рефакторинг реализован — единый INSERT...SELECT...GENERATE_SERIES ON CONFLICT DO NOTHING; уникальный частичный индекс в миграции 033; 180k await'ов → 1 SQL-оператор.
