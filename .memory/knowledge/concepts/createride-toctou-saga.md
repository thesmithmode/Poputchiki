---
title: "CreateRide TOCTOU — Two-Step INSERT Without Transaction"
aliases: [createride-orphan, toctou-createride, orphan-template, 2phase-insert-gap]
tags: [backend, database, concurrency, architecture, gotcha]
sources: ["daily/2026-05-20.md"]
created: 2026-05-20
updated: 2026-05-20
---

# CreateRide TOCTOU — Two-Step INSERT Without Transaction

## Суть

`apps/api` — эндпоинт `POST /rides` создаёт сначала template, потом ride двумя отдельными INSERT без транзакции. Если процесс падает (OOM, kill, DB timeout) между первым и вторым INSERT — template остаётся в БД без привязанной поездки. Orphan-записи накапливаются, нарушают FK-инварианты, засоряют таблицу.

## Механика

```ts
// Проблема — два отдельных INSERT
const template = await db.insert(ride_templates).values(...).returning();
// ← crash здесь = orphan template
const ride = await db.insert(rides).values({ templateId: template.id, ... });

// Исправление — единая транзакция
const ride = await db.transaction(async (tx) => {
  const [template] = await tx.insert(ride_templates).values(...).returning();
  const [ride] = await tx.insert(rides).values({ templateId: template.id, ... }).returning();
  return ride;
});
```

## Паттерн

Любые два INSERT/UPDATE которые должны быть атомарными — обязательно в `sql.begin()` / `db.transaction()`. Без транзакции TOCTOU и partial failure неизбежны при нагрузке 50k пользователей.

## Диагностика orphan-записей

```sql
SELECT t.id FROM ride_templates t
LEFT JOIN rides r ON r.template_id = t.id
WHERE r.id IS NULL;
```

Непустой результат = orphans уже накопились.

## Связь

- [[atomic-update-race-condition]] — тот же класс проблем (partial update без транзакции)
- [[force-row-level-security]] — транзакция также место установки GUC для RLS
