---
title: "Silent Filter No-Op — useFilters Trust Fields Declared but Not Applied"
aliases: [usefilters-noop, trust-filter-silent, applyFilters-gap]
tags: [frontend, react, bug, ux, gotcha]
sources: ["daily/2026-05-20.md"]
created: 2026-05-20
updated: 2026-05-20
---

# Silent Filter No-Op — useFilters Trust Fields Declared but Not Applied

## Суть

`web/src/hooks/useFilters.ts:73-108` — поля `verifiedOnly`, `trustMinAccountAgeDays`, `trustMinLikes`, `trustMinTrips` объявлены в state и отображаются в UI (зелёный badge «доверие»), но функция `applyFilters()` их не проверяет. Пользователь выставляет фильтры доверия, видит активный badge, но список поездок не изменяется — данные не фильтруются.

## Механика

```ts
// useFilters.ts — state объявлен
const [verifiedOnly, setVerifiedOnly] = useState(false);
const [trustMinLikes, setTrustMinLikes] = useState(0);

// applyFilters() — trust-поля не используются
function applyFilters(rides: Ride[]) {
  return rides.filter(r =>
    r.from === fromFilter &&
    r.to === toFilter
    // verifiedOnly / trustMin* — не применяются
  );
}
```

## Последствия

- UX-обман: пользователь думает что фильтрует по доверию, но видит всех водителей
- Safety риск: основная ценность фичи (доверенные попутчики) не работает
- Severity: Critical (фича-призрак в продакшне)

## Исправление

В `applyFilters()` добавить проверки:

```ts
.filter(r => !verifiedOnly || r.driver.isVerified)
.filter(r => r.driver.accountAgeDays >= trustMinAccountAgeDays)
.filter(r => r.driver.likes >= trustMinLikes)
.filter(r => r.driver.trips >= trustMinTrips)
```

## Антипаттерн

State без effect/consumer — объявить переменную в state и не использовать её нигде — молчаливый no-op, не ловится линтером.
