import { useState } from "react";
import type { Ride } from "../types/ride";

export interface Filters {
  trustMinAccountAgeDays: number;
  trustMinLikes: number;
  favoritesOnly: boolean;
  verifiedOnly: boolean;
  direction: string;
  priceMax: number | null;
  seatsMin: number;
}

export const DEFAULT_FILTERS: Filters = {
  trustMinAccountAgeDays: 0,
  trustMinLikes: 0,
  favoritesOnly: false,
  verifiedOnly: false,
  direction: "",
  priceMax: null,
  seatsMin: 1,
};

const STORAGE_KEY = "poputchiki:filters";

function loadFilters(): Filters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: Filters): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
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
    setFiltersState(DEFAULT_FILTERS);
  }

  return { filters, setFilters, resetFilters };
}

export function applyFilters(rides: Ride[], filters: Filters): Ride[] {
  return rides.filter((ride) => {
    if (filters.direction) {
      const q = filters.direction.toLowerCase();
      const match =
        ride.from_label.toLowerCase().includes(q) || ride.to_label.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (filters.priceMax !== null) {
      if (ride.price_rub !== null && ride.price_rub > filters.priceMax) return false;
    }

    const freeSeats = ride.seats_total - ride.seats_taken;
    if (freeSeats < filters.seatsMin) return false;

    return true;
  });
}
