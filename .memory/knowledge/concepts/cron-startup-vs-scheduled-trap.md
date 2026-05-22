---
title: "Cron: ловушка UTCHour guard при старте контейнера"
aliases: [cron-startup-guard, cron-deploy-gap, expand-templates-guard, cron-startup-run]
tags: [backend, cron, docker, deploy, gotcha]
sources:
  - "daily/2026-05-22.md"
created: 2026-05-22
updated: 2026-05-22
---

# Cron: ловушка UTCHour guard при старте контейнера

Cron-задача с проверкой `UTCHour === 3` внутри тела задачи выполняется каждый час (`oncePer(ONE_HOUR)`), но сам guard делает полезную работу только если контейнер жив в 3:00 UTC. При деплое (рестарте контейнера) guard срабатывает в «не то» время → задача пропускается → первый реальный запуск через до 23 часов.

## Симптом

После деплоя поездки (или другие expand-ресурсы) не появляются. Ошибок нет. `docker logs cron` показывает запуск, но нет INSERT'ов. Диагностика: проверить, содержит ли задача guard `if (new Date().getUTCHours() !== TARGET_HOUR) return`.

## Антипаттерн

```typescript
// НЕПРАВИЛЬНО: guard внутри тела задачи
cron.schedule("0 * * * *", async () => {
  if (new Date().getUTCHours() !== 3) return; // <-- проблема
  await expandTemplates();
});
```

Итог: задача запускается ежечасно, но делает работу только в 3:00 UTC. Деплой в 15:00 → ждать до 3:00 следующего дня.

## Правильный паттерн

```typescript
// ПРАВИЛЬНО: oncePer дедупликация + безусловный запуск при старте
async function runExpandTemplates() {
  await expandTemplates({ horizonDays: 30 });
}

// Безусловный запуск при старте контейнера
runExpandTemplates().catch(log.error);

// Плановый запуск каждый час (oncePer предотвращает дубли)
cron.schedule("0 * * * *", () => oncePer(ONE_HOUR, "expand-templates", runExpandTemplates));
```

`oncePer` записывает timestamp последнего успешного запуска в БД/файл и пропускает, если прошло меньше `ONE_HOUR`. Это предотвращает двойной запуск если startup + scheduled run попали в одно окно.

## Advisory lock и silent hole

Если одновременно запущены два инстанса cron (blue/green deploy), advisory lock корректно блокирует дубликаты — побеждает первый. Но если winner упал до завершения задачи:
- Lock освобождён (транзакционный advisory lock — auto-release)
- Второй инстанс уже завершился (проиграл lock и вышел)
- Следующий шанс выполнить задачу — по расписанию, т.е. до часа ожидания
- Итог: 0 поездок молча, без ошибки в логах

Митигация: `oncePer` с проверкой timestamp → если после краша winner's timestamp не записан, следующий планировщик запустится в течение часа без ожидания до 3:00.

## Горизонт expand

Для `expand_templates` выбран горизонт 30 дней (не 7, не 14):
- 7 дней: пользователь не видит поездки при планировании недели вперёд
- 14 дней: граничный случай для двухнедельных регулярных поездок
- 30 дней: достаточно для месячного планирования, терпимая нагрузка (см. bulk-insert-transaction-risk)

## Related Concepts

- [[concepts/advisory-lock-pool-safety]] - pg_try_advisory_xact_lock для cron deduplication
- [[concepts/bulk-insert-transaction-risk]] - 30 дней × N шаблонов = риск большой транзакции, требует батчинга

## Sources

- [[daily/2026-05-22.md]] - Session 17:49: UTCHour===3 guard пропускал запуск при рестарте → поездки не создавались после деплоя. Фикс: убрать guard → `oncePer(ONE_HOUR)` + безусловный запуск при старте. Горизонт 30 дней. Advisory lock корректен для dual-instance, но если winner падает → 0 результатов до следующего scheduled run.
