import { useState } from "react";
import type { Ride } from "../types/ride";

export type DatePreset = "24h" | "48h" | "7d" | "custom" | null;

export interface Filters {
  trustMinAccountAgeDays: number;
  trustMinLikes: number;
  favoritesOnly: boolean;
  verifiedOnly: boolean;
  hideMyRides: boolean;
  direction: string;
  priceMin: number | null;
  priceMax: number | null;
  seatsMin: number;
  datePreset: DatePreset;
  fromAt: string | null;
  toAt: string | null;
}

export const DEFAULT_FILTERS: Filters = {
  trustMinAccountAgeDays: 0,
  trustMinLikes: 0,
  favoritesOnly: false,
  verifiedOnly: false,
  hideMyRides: false,
  direction: "",
  priceMin: null,
  priceMax: null,
  seatsMin: 0,
  datePreset: "24h",
  fromAt: null,
  toAt: null,
};

const STORAGE_KEY = "poputchiki:filters";
const SESSION_DIRECTION_KEY = "poputchiki:filters:direction";

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const persisted = raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) } : DEFAULT_FILTERS;
    // direction lives in sessionStorage — cleared when app closes, persists while open
    const direction = sessionStorage.getItem(SESSION_DIRECTION_KEY) ?? DEFAULT_FILTERS.direction;
    return { ...persisted, direction };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: Filters): void {
  // datePreset/fromAt/toAt не персистим — при новой сессии всегда дефолт "24h"
  const { direction, datePreset: _dp, fromAt: _fa, toAt: _ta, ...rest } = f;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  if (direction) {
    sessionStorage.setItem(SESSION_DIRECTION_KEY, direction);
  } else {
    sessionStorage.removeItem(SESSION_DIRECTION_KEY);
  }
}

export function useFilters() {
  const [filters, setFiltersState] = useState<Filters>(loadFilters);

  function setFilters(partial: Partial<Filters>) {
    setFiltersState((prev) => {
      const next = { ...prev, ...partial };
      saveFilters(next);
      return next;
    });
  }

  function resetFilters() {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_DIRECTION_KEY);
    setFiltersState(DEFAULT_FILTERS);
  }

  return { filters, setFilters, resetFilters };
}

export function resolveDateRange(filters: {
  datePreset: DatePreset;
  fromAt: string | null;
  toAt: string | null;
}): { fromAt: string | null; toAt: string | null } {
  if (filters.datePreset === "custom") {
    return { fromAt: filters.fromAt, toAt: filters.toAt };
  }
  const now = new Date();
  const from = now.toISOString();
  if (filters.datePreset === "24h") {
    return { fromAt: from, toAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString() };
  }
  if (filters.datePreset === "48h") {
    return { fromAt: from, toAt: new Date(now.getTime() + 48 * 3600 * 1000).toISOString() };
  }
  if (filters.datePreset === "7d") {
    return { fromAt: from, toAt: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString() };
  }
  // null — без ограничений
  return { fromAt: from, toAt: null };
}

export function applyFilters(
  rides: Ride[],
  filters: Filters,
  favoriteIds?: Set<string>,
  myUserId?: string | null,
): Ride[] {
  return rides.filter((ride) => {
    if (filters.hideMyRides && myUserId && ride.driver_id === myUserId) return false;

    if (filters.favoritesOnly && favoriteIds !== undefined) {
      if (!favoriteIds.has(ride.driver_id)) return false;
    }

    if (filters.direction) {
      const q = filters.direction.toLowerCase();
      const match =
        ride.from_label.toLowerCase().includes(q) || ride.to_label.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (filters.priceMin !== null) {
      if (ride.price_rub !== null && ride.price_rub < filters.priceMin) return false;
    }

    if (filters.priceMax !== null) {
      if (ride.price_rub !== null && ride.price_rub > filters.priceMax) return false;
    }

    if (filters.seatsMin > 0) {
      const freeSeats = ride.seats_total - ride.seats_taken;
      if (freeSeats < filters.seatsMin) return false;
    }

    return true;
  });
}
