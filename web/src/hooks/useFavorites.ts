import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";

export interface FavoriteEntry {
  target_id: string;
  notify: boolean;
  created_at: string;
  display_name: string;
  tg_username: string | null;
  avatar_url: string | null;
}

export interface FavoriteHint {
  display_name?: string | null;
  tg_username?: string | null;
  avatar_url?: string | null;
}

/**
 * Optimistic-обёртка над избранным.
 *
 * Архитектура (TanStack Query v5):
 * - `useQuery` тянет полный список FavoriteEntry[].
 * - Каждая мутация (add/remove/setNotify) проходит 4-callback цикл:
 *     onMutate  → cancelQueries + snapshot + setQueryData(оптимистично)
 *     onError   → откат к snapshot
 *     onSettled → invalidateQueries — всегда (и при успехе, и при ошибке)
 * - Snapshot хранится в локальном замыкании mutate (третий аргумент onError),
 *   а не на window/refs — корректно для конкурентных мутаций (каждая со своим).
 *
 * Внешний API хука сохранён: `toggle`/`setNotify` — обычные функции,
 * не Promise. UI не ждёт сервер, реакция мгновенная.
 *
 * `toggle(targetId, hint?)` — необязательный hint c полями профиля
 * (display_name/tg_username/avatar_url). При add используется как
 * placeholder для FavoritesScreen, пока invalidate не подгрузит реальные
 * данные. Без hint поля будут пустые — это допустимо для коллеров,
 * которым нужен только isFavorite-чекер (FeedScreen-карточки), но для
 * FavoritesScreen лучше hint передать.
 */
export function useFavorites() {
  const qc = useQueryClient();
  const key = queryKeys.favorites.all;

  const { data = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => apiFetch<FavoriteEntry[]>("/favorites/me"),
    staleTime: 60_000,
  });

  const favoriteIds = useMemo(() => new Set(data.map((f) => f.target_id)), [data]);

  function isFavorite(targetId: string) {
    return favoriteIds.has(targetId);
  }

  const addMutation = useMutation({
    mutationFn: (vars: { targetId: string; hint?: FavoriteHint }) =>
      apiFetch("/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: vars.targetId }),
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FavoriteEntry[]>(key) ?? [];
      // Уже в списке (например, race с другим окном) — не дублируем.
      if (previous.some((f) => f.target_id === vars.targetId)) {
        return { previous };
      }
      const placeholder: FavoriteEntry = {
        target_id: vars.targetId,
        notify: true,
        created_at: new Date().toISOString(),
        display_name: vars.hint?.display_name ?? "",
        tg_username: vars.hint?.tg_username ?? null,
        avatar_url: vars.hint?.avatar_url ?? null,
      };
      qc.setQueryData<FavoriteEntry[]>(key, [...previous, placeholder]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { targetId: string }) =>
      apiFetch(`/favorites/${vars.targetId}`, { method: "DELETE" }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FavoriteEntry[]>(key) ?? [];
      qc.setQueryData<FavoriteEntry[]>(
        key,
        previous.filter((f) => f.target_id !== vars.targetId),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  const notifyMutation = useMutation({
    mutationFn: (vars: { targetId: string; notify: boolean }) =>
      apiFetch(`/favorites/${vars.targetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notify: vars.notify }),
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FavoriteEntry[]>(key) ?? [];
      qc.setQueryData<FavoriteEntry[]>(
        key,
        previous.map((f) => (f.target_id === vars.targetId ? { ...f, notify: vars.notify } : f)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
    },
  });

  function toggle(targetId: string, hint?: FavoriteHint) {
    if (isFavorite(targetId)) {
      removeMutation.mutate({ targetId });
    } else {
      addMutation.mutate(hint ? { targetId, hint } : { targetId });
    }
  }

  function setNotify(targetId: string, notify: boolean) {
    notifyMutation.mutate({ targetId, notify });
  }

  return { favorites: data, isLoading, isFavorite, toggle, setNotify, favoriteIds };
}
