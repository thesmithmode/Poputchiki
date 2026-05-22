/**
 * Централизованный реестр query keys для TanStack Query.
 *
 * Зачем: при росте проекта строковые литералы вида `["ride", id]` расползаются
 * по экранам и хукам — invalidate легко рассинхронизировать (один пишет
 * `["rides"]`, другой `["ride"]`). Один источник правды + хелперы-фабрики
 * страхуют от этого и дают type-safe ключи. Шаблон по рекомендации
 * TanStack Query v5 (TkDodo) — см. docs/optimistic-updates.
 *
 * Все значения помечены `as const` чтобы tuple-литералы не схлопывались в
 * `string[]` и сохраняли строгую типизацию. Использовать так:
 *   useQuery({ queryKey: queryKeys.ride.detail(id), ... })
 *   qc.invalidateQueries({ queryKey: queryKeys.ride.all })
 */
export const queryKeys = {
  favorites: {
    all: ["favorites"] as const,
  },
  rides: {
    all: ["rides"] as const,
    list: (preset: string | null, fromAt: string | null, toAt: string | null) =>
      ["rides", "list", preset, fromAt, toAt] as const,
    mine: (role: string, when: string) => ["rides", "mine", role, when] as const,
  },
  ride: {
    all: ["ride"] as const,
    detail: (id: string) => ["ride", id] as const,
  },
  notifications: {
    all: ["notifications"] as const,
  },
  notifPrefs: {
    all: ["notif-prefs"] as const,
  },
  user: {
    detail: (id: string) => ["user", id] as const,
  },
  me: {
    all: ["me"] as const,
  },
  admin: {
    tickets: ["admin-tickets"] as const,
    complaints: ["admin-complaints"] as const,
  },
  support: {
    tickets: ["support-tickets"] as const,
  },
  rideRequests: {
    mine: ["ride-requests", "mine"] as const,
  },
} as const;
