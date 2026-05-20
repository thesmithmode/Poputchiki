---
title: "Optimistic Update Without Rollback — Silent State Corruption on Error"
aliases: [optimistic-rollback, tripcard-join-optimistic, ui-state-desync]
tags: [frontend, react, ux, pattern, gotcha]
sources: ["daily/2026-05-20.md"]
created: 2026-05-20
updated: 2026-05-20
---

# Optimistic Update Without Rollback — Silent State Corruption on Error

## Суть

`web/src/components/TripCard.tsx` — при нажатии «Присоединиться» UI немедленно показывает joined-состояние (оптимистичный апдейт), но в catch-блоке нет восстановления предыдущего состояния. Если сервер вернул ошибку (место занято, бан, сеть), кнопка остаётся в состоянии «Вы едете» хотя пользователь не добавлен.

## Механика

```tsx
// Проблема
async function handleJoin() {
  setIsJoined(true);       // оптимистичный апдейт
  setCount(c => c + 1);
  try {
    await api.joinRide(rideId);
  } catch {
    // нет rollback → состояние врёт
    showToast('Ошибка');
  }
}

// Исправление
async function handleJoin() {
  const prevJoined = isJoined;
  const prevCount = count;
  setIsJoined(true);
  setCount(c => c + 1);
  try {
    await api.joinRide(rideId);
  } catch (e) {
    setIsJoined(prevJoined);   // rollback
    setCount(prevCount);
    showToast('Ошибка: ' + e.message);
  }
}
```

## Последствия

- Пользователь думает что записался, но сервер его не добавил
- Повторное нажатие не работает (кнопка уже в joined-состоянии)
- Водитель не видит пассажира, пассажир теряет поездку

## Правило

Оптимистичный апдейт = сохранить prevState → применить → catch: восстановить prevState. Без этого шаблона оптимистичные апдейты опасны.
