import { useEffect, useState } from "react";
import type { Filters } from "./useFilters";
import { DEFAULT_FILTERS } from "./useFilters";

export interface FilterPreset {
  id: string;
  name: string;
  createdAt: string;
  filters: Filters;
}

const STORAGE_KEY = "pp_filter_presets";

function loadPresets(): FilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is FilterPreset =>
        p && typeof p.id === "string" && typeof p.name === "string" && p.filters,
    );
  } catch {
    return [];
  }
}

function savePresets(presets: FilterPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useFilterPresets() {
  const [presets, setPresets] = useState<FilterPreset[]>(loadPresets);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setPresets(loadPresets());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function addPreset(name: string, filters: Filters): FilterPreset {
    const preset: FilterPreset = {
      id: genId(),
      name: name.trim() || "Без названия",
      createdAt: new Date().toISOString(),
      filters: { ...DEFAULT_FILTERS, ...filters },
    };
    const next = [...presets, preset];
    setPresets(next);
    savePresets(next);
    return preset;
  }

  function removePreset(id: string): void {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    savePresets(next);
  }

  function renamePreset(id: string, name: string): void {
    const next = presets.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p));
    setPresets(next);
    savePresets(next);
  }

  return { presets, addPreset, removePreset, renamePreset };
}

export function summarizePreset(filters: Filters): string {
  const parts: string[] = [];
  if (filters.direction) parts.push(`«${filters.direction}»`);
  if (filters.priceMin !== null && filters.priceMax !== null) {
    parts.push(`${filters.priceMin}–${filters.priceMax} ₽`);
  } else if (filters.priceMin !== null) {
    parts.push(`от ${filters.priceMin} ₽`);
  } else if (filters.priceMax !== null) {
    parts.push(`до ${filters.priceMax} ₽`);
  }
  if (filters.seatsMin > 0) parts.push(`мест ≥ ${filters.seatsMin}`);
  if (filters.verifiedOnly) parts.push("верифицированные");
  if (filters.hideMyRides) parts.push("без моих");
  if (filters.datePreset === "24h") parts.push("24ч");
  else if (filters.datePreset === "48h") parts.push("48ч");
  else if (filters.datePreset === "7d") parts.push("7 дней");
  else if (filters.datePreset === null) parts.push("любая дата");
  return parts.join(" · ") || "Без фильтров";
}
