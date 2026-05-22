---
title: "UNNEST Batch UPDATE — единый round-trip вместо N UPDATE в цикле"
aliases: [unnest-update, batch-update-unnest, unnest-set-enabled]
tags: [database, postgresql, performance, pattern, notifications]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# UNNEST Batch UPDATE — единый round-trip вместо N UPDATE в цикле

PostgreSQL UNNEST позволяет передать массивы параметров и выполнить один UPDATE для всего набора строк. Заменяет N отдельных UPDATE в цикле одним round-trip. Обнаружено в `notificationsRouter.ts`: 13 индивидуальных UPDATE в цикле по категориям уведомлений заменены одним UNNEST UPDATE.

## Антипаттерн

```typescript
// НЕПРАВИЛЬНО: N round-trips
for (const { category, enabled } of preferences) {
  await sql`
    UPDATE notification_preferences
    SET enabled = ${enabled}
    WHERE user_id = ${userId} AND category = ${category}
  `;
}
```

13 категорий = 13 запросов к БД на каждый вызов PATCH /notifications/preferences.

## Правильный паттерн

```sql
-- ПРАВИЛЬНО: единый round-trip
UPDATE notification_preferences AS np
SET enabled = t.enabled
FROM UNNEST($1::uuid[], $2::text[], $3::bool[]) AS t(user_id, category, enabled)
WHERE np.user_id = t.user_id AND np.category = t.category
```

```typescript
// TypeScript вариант (postgres.js)
const userIds = preferences.map(() => userId);
const categories = preferences.map(p => p.category);
const enabledValues = preferences.map(p => p.enabled);

await sql`
  UPDATE notification_preferences AS np
  SET enabled = t.enabled
  FROM UNNEST(
    ${sql.array(userIds)}::uuid[],
    ${sql.array(categories)}::text[],
    ${sql.array(enabledValues)}::bool[]
  ) AS t(user_id, category, enabled)
  WHERE np.user_id = t.user_id AND np.category = t.category
`;
```

## Когда применять

- Обновление нескольких строк с разными значениями (не одинаковым SET для всех)
- Массовое изменение настроек, флагов, счётчиков
- N > 3 строк — при меньшем числе отдельные UPDATE проще

## Ограничения

- Тип массива должен явно совпадать с типом колонки (`::uuid[]`, `::text[]`, `::bool[]`)
- Нет автоматической защиты от дубликатов в массиве — проверять на уровне приложения
- Пустой массив — безопасно: UNNEST($1::uuid[]) с пустым массивом = 0 совпадений, 0 обновлений

## Related Concepts

- [[concepts/enqueue-notification-helper]] — `enqueueNotificationBatch` использует UNNEST INSERT для batch-вставки уведомлений нескольким получателям
- [[concepts/n-plus-one-sse-invalidation]] — похожая проблема N+1, но на чтении; UNNEST решает N+1 на записи
- [[concepts/bulk-insert-transaction-risk]] — связан: batch UPDATE через UNNEST избегает проблем большой транзакции

## Sources

- [[daily/2026-05-22.md]] — Session 18:15: notificationsRouter 13×UPDATE в цикле по категориям → заменён UNNEST UPDATE, единый round-trip
