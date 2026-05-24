---
title: "Library Packages Must Not Use console.* — TypeScript lib Config Constraint"
aliases: [library-no-console, shared-package-console, typescript-lib-console]
tags: [typescript, architecture, pattern, gotcha, shared-package]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# Library Packages Must Not Use console.* — TypeScript lib Config Constraint

## Проблема

`@poputchiki/shared` (packages/shared) компилируется с `"lib": ["ES2022"]` в tsconfig.json. Эта конфигурация не включает `DOM` и не предоставляет глобал `console`. Любой вызов `console.error()`/`console.log()` в коде пакета вызывает typecheck-ошибку:

```
error TS2304: Cannot find name 'console'.
```

## Контекст

Библиотечные пакеты (без `DOM` lib) намеренно изолированы от browser/Node globals. `console` — не часть ECMAScript стандарта, это runtime global. В `lib`-пакете он недоступен.

Симптом обнаружен в сессии 18:35 daily/2026-05-22.md: функция `enqueueNotification` в packages/shared содержала try-catch с `console.error()`, что ломало typecheck CI-джоба.

## Неправильный паттерн

```typescript
// packages/shared/src/notifications.ts
export async function enqueueNotification(...) {
  try {
    await sql`INSERT INTO user_notifications ...`;
    await sql`SELECT pg_notify('notify_user', $1)`;
  } catch (err) {
    console.error('Notification failed:', err); // TS2304: Cannot find name 'console'
  }
}
```

## Правильный паттерн

```typescript
// packages/shared/src/notifications.ts — без try-catch, без console
export async function enqueueNotification(...) {
  await sql`INSERT INTO user_notifications ...`;
  await sql`SELECT pg_notify('notify_user', $1)`;
  // caller оборачивает в try-catch со своим логгером
}

// apps/api/src/routes/rides.ts — call-site сам обрабатывает ошибки
try {
  await enqueueNotification(sql, userId, payload);
} catch (err) {
  logger.error({ err }, 'Failed to enqueue notification');
}
```

## Правило

В `packages/shared` и любом другом library-пакете:
- **Запрещено**: `console.*`, `process.*`, `window.*`, `document.*`, `fetch()`
- **Разрешено**: чистые ES2022 функции, типы, SQL-хелперы без side effects
- Логирование и error-handling — ответственность вызывающего (`apps/api`, `apps/notifier`, `apps/cron`)

## Связанные концепции

- [[concepts/enqueue-notification-helper]] — centralised helper в packages/shared
- [[concepts/enqueue-notification-batch]] — batch версия с UNNEST
