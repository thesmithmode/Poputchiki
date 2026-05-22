---
title: "Оптимистичное setQueryData после POST /rides"
aliases: [setquerydata-post-rides, optimistic-ride-creation, react-query-setquerydata-post]
tags: [react-query, frontend, optimistic-update, ux, tanstack-query]
sources:
  - "daily/2026-05-21.md"
created: 2026-05-21
updated: 2026-05-21
---

# Оптимистичное setQueryData после POST /rides

После `POST /rides` используй `queryClient.setQueryData` с ответом сервера, чтобы мгновенно показать новую поездку автору — без лишнего серверного refetch. Обновляются оба кеша: `["rides"]` (общий фид) и `["rides","mine","driver","future"]` (мои поездки). Остальные пользователи получают обновление через SSE/polling как обычно. `setQueryData` с ответом POST дешевле `invalidateQueries` (нет лишнего GET-запроса).

## Key Points

- `queryClient.setQueryData(["rides"], (old) => [newRide, ...(old ?? [])])` — вставить в начало фида
- `queryClient.setQueryData(["rides","mine","driver","future"], (old) => [newRide, ...(old ?? [])])` — обновить список «Мои поездки»
- Данные берутся напрямую из ответа сервера на POST — не нужен повторный GET
- `invalidateQueries` после POST = лишний GET → не использовать для мгновенного фидбека автору
- Fallback для пустого `actor_name` в SSE-событии: показывать «Пользователь», не название продукта
- Остальные пользователи получают обновление через SSE `ride_created` событие → polling/refetch как обычно

## Details

Паттерн в mutation hook (`useCreateRide`):

```typescript
const queryClient = useQueryClient();

const mutation = useMutation({
  mutationFn: (data: CreateRideInput) =>
    apiFetch<Ride>("/rides", { method: "POST", body: JSON.stringify(data) }),

  onSuccess: (newRide) => {
    // Instantly show to author — no extra GET request
    queryClient.setQueryData<Ride[]>(["rides"], (old) => [
      newRide,
      ...(old ?? []),
    ]);
    queryClient.setQueryData<Ride[]>(
      ["rides", "mine", "driver", "future"],
      (old) => [newRide, ...(old ?? [])]
    );
    // Do NOT call invalidateQueries here — that would trigger an extra GET
  },
});
```

**Почему не invalidateQueries:** `invalidateQueries` помечает кеш устаревшим и запускает background refetch. Для автора создания это = дополнительный GET /rides сразу после успешного POST. При высокой нагрузке (50k пользователей) лишние запросы нежелательны. `setQueryData` с уже имеющимся ответом сервера бесплатно — нет сетевого вызова.

**Когда invalidateQueries нужен:** Если ответ POST не содержит всех полей, нужных для рендера (join данные, вычисляемые поля), или если кеш может содержать устаревшие данные от параллельных изменений — тогда `invalidateQueries` правильнее.

**Fallback actor_name в SSE-событиях:**
```typescript
// SSE event handler in useRealtime
const actorName = event.actor_name || "Пользователь";
// Not: event.actor_name || "Poputchiki"  ← brand name здесь неуместно
```

Пустой `actor_name` возможен если: пользователь ещё не заполнил профиль, событие сгенерировано системой (cron), или backend не заполнил поле.

**Связь с оптимистичным обновлением без rollback:** В отличие от кнопки «Вступить» (`useJoinRide`), где оптимистичное `joined=true` устанавливается ДО ответа сервера и нужен rollback в `onError`, здесь мы ждём успешного ответа POST перед вызовом `setQueryData`. Это не «оптимистичное» обновление в строгом смысле — это просто **кеширование уже подтверждённого результата**.

## Related Concepts

- [[concepts/optimistic-update-without-rollback]] — Антипаттерн: оптимистичный setQueryData до ответа сервера без rollback в onError
- [[concepts/n-plus-one-sse-invalidation]] — Обратная сторона: invalidateQueries на каждый SSE-event без debounce = N+1 проблема
- [[concepts/pg-notify-single-channel]] — SSE-канал, по которому другие пользователи получают ride_created событие

## Sources

- [[daily/2026-05-21.md]] — После POST /rides: setQueryData для ["rides"] и ["rides","mine","driver","future"] чтобы мгновенно показать поездку автору; actor_name fallback "Пользователь" при пустом значении; setQueryData дешевле invalidateQueries
