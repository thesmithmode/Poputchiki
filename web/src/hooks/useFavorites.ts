import { useQuery, useQueryClient } from "@tanstack/react-query";
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

export function useFavorites() {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: queryKeys.favorites.all,
    queryFn: () => apiFetch<FavoriteEntry[]>("/favorites/me"),
    staleTime: 60_000,
  });

  const favoriteIds = useMemo(() => new Set(data.map((f) => f.target_id)), [data]);

  function isFavorite(targetId: string) {
    return favoriteIds.has(targetId);
  }

  async function toggle(targetId: string) {
    if (isFavorite(targetId)) {
      await apiFetch(`/favorites/${targetId}`, { method: "DELETE" });
    } else {
      await apiFetch("/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: targetId }),
      });
    }
    await qc.invalidateQueries({ queryKey: queryKeys.favorites.all });
  }

  async function setNotify(targetId: string, notify: boolean) {
    await apiFetch(`/favorites/${targetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify }),
    });
    await qc.invalidateQueries({ queryKey: queryKeys.favorites.all });
  }

  return { favorites: data, isLoading, isFavorite, toggle, setNotify, favoriteIds };
}
