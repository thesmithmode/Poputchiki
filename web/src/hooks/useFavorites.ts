import { useCallback, useState } from "react";

const KEY = "pp_favorites_v1";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

function save(ids: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch {}
}

export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(load);

  const isFavorite = useCallback((driverId: string) => favoriteIds.has(driverId), [favoriteIds]);

  const toggle = useCallback((driverId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set<string>(prev);
      if (next.has(driverId)) {
        next.delete(driverId);
      } else {
        next.add(driverId);
      }
      save(next);
      return next;
    });
  }, []);

  return { favoriteIds, isFavorite, toggle };
}
