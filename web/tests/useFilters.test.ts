import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, applyFilters, useFilters } from "../src/hooks/useFilters";
import type { Ride } from "../src/types/ride";

function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: crypto.randomUUID(),
    driver_id: crypto.randomUUID(),
    from_label: "ЖК Царёво",
    from_lat: 55.75,
    from_lng: 37.61,
    to_label: "Москва Центр",
    to_lat: 55.8,
    to_lng: 37.65,
    departure_at: new Date(Date.now() + 3_600_000).toISOString(),
    price_rub: 100,
    seats_total: 3,
    seats_taken: 1,
    status: "active",
    comment: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("useFilters", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("возвращает дефолтные фильтры при отсутствии localStorage", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it("загружает фильтры из localStorage при монтировании", () => {
    const saved = { ...DEFAULT_FILTERS, direction: "Центр", seatsMin: 2 };
    localStorage.setItem("poputchiki:filters", JSON.stringify(saved));
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.direction).toBe("Центр");
    expect(result.current.filters.seatsMin).toBe(2);
  });

  it("сохраняет фильтры в localStorage при обновлении", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setFilters({ direction: "Баумана" });
    });
    const stored = JSON.parse(localStorage.getItem("poputchiki:filters") ?? "{}");
    expect(stored.direction).toBe("Баумана");
  });

  it("сбрасывает фильтры к дефолтным", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setFilters({ direction: "test", seatsMin: 3 });
    });
    act(() => {
      result.current.resetFilters();
    });
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(localStorage.getItem("poputchiki:filters")).toBeNull();
  });

  it("игнорирует невалидный JSON в localStorage", () => {
    localStorage.setItem("poputchiki:filters", "not-json");
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });
});

describe("applyFilters", () => {
  const rides = [
    makeRide({ from_label: "ЖК Царёво", to_label: "Москва Центр", price_rub: 100, seats_total: 3, seats_taken: 1 }),
    makeRide({ from_label: "Казань", to_label: "Аэропорт", price_rub: 500, seats_total: 4, seats_taken: 3 }),
    makeRide({ from_label: "Центр", to_label: "ЖК Царёво", price_rub: null, seats_total: 2, seats_taken: 2 }),
  ];

  it("без фильтров возвращает все поездки", () => {
    expect(applyFilters(rides, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it("фильтрует по direction (from_label)", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, direction: "царёво" });
    expect(result).toHaveLength(2);
    result.forEach((r) => {
      expect(r.from_label.toLowerCase() + r.to_label.toLowerCase()).toContain("царёво");
    });
  });

  it("фильтрует по direction (to_label)", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, direction: "аэропорт" });
    expect(result).toHaveLength(1);
    expect(result[0].to_label).toBe("Аэропорт");
  });

  it("direction поиск нечувствителен к регистру", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, direction: "КАЗАНЬ" });
    expect(result).toHaveLength(1);
  });

  it("фильтрует по priceMax — исключает дорогие", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, priceMax: 200 });
    // 100 — проходит, 500 — нет, null — бесплатная, проходит
    expect(result).toHaveLength(2);
  });

  it("priceMax=null не фильтрует по цене", () => {
    expect(applyFilters(rides, { ...DEFAULT_FILTERS, priceMax: null })).toHaveLength(3);
  });

  it("фильтрует по seatsMin — свободные места", () => {
    // ride[0]: 3-1=2 свободных, ride[1]: 4-3=1 свободных, ride[2]: 2-2=0 свободных
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, seatsMin: 2 });
    expect(result).toHaveLength(1);
    expect(result[0].from_label).toBe("ЖК Царёво");
  });

  it("пустой список rides → пустой результат", () => {
    expect(applyFilters([], DEFAULT_FILTERS)).toHaveLength(0);
  });
});
