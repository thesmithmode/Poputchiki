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
    sessionStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("возвращает дефолтные фильтры при отсутствии хранилищ", () => {
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });

  it("загружает direction из sessionStorage, остальное из localStorage", () => {
    const saved = { ...DEFAULT_FILTERS, seatsMin: 2 };
    localStorage.setItem("poputchiki:filters", JSON.stringify(saved));
    sessionStorage.setItem("poputchiki:filters:direction", "Центр");
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.direction).toBe("Центр");
    expect(result.current.filters.seatsMin).toBe(2);
  });

  it("direction пустой при отсутствии sessionStorage (новая сессия = закрытое приложение)", () => {
    const saved = { ...DEFAULT_FILTERS, direction: "Аэропорт", seatsMin: 2 };
    localStorage.setItem("poputchiki:filters", JSON.stringify(saved));
    // sessionStorage пуст — имитирует закрытие приложения
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters.direction).toBe("");
    expect(result.current.filters.seatsMin).toBe(2);
  });

  it("сохраняет direction в sessionStorage, остальное в localStorage", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setFilters({ direction: "Баумана" });
    });
    expect(sessionStorage.getItem("poputchiki:filters:direction")).toBe("Баумана");
    const stored = JSON.parse(localStorage.getItem("poputchiki:filters") ?? "{}");
    expect(stored.direction).toBeUndefined();
  });

  it("очищает sessionStorage direction при setFilters({ direction: '' })", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setFilters({ direction: "Баумана" });
    });
    act(() => {
      result.current.setFilters({ direction: "" });
    });
    expect(sessionStorage.getItem("poputchiki:filters:direction")).toBeNull();
  });

  it("сбрасывает фильтры к дефолтным и очищает оба хранилища", () => {
    const { result } = renderHook(() => useFilters());
    act(() => {
      result.current.setFilters({ direction: "test", seatsMin: 3 });
    });
    act(() => {
      result.current.resetFilters();
    });
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
    expect(localStorage.getItem("poputchiki:filters")).toBeNull();
    expect(sessionStorage.getItem("poputchiki:filters:direction")).toBeNull();
  });

  it("игнорирует невалидный JSON в localStorage", () => {
    localStorage.setItem("poputchiki:filters", "not-json");
    const { result } = renderHook(() => useFilters());
    expect(result.current.filters).toEqual(DEFAULT_FILTERS);
  });
});

describe("applyFilters", () => {
  const rides = [
    makeRide({
      from_label: "ЖК Царёво",
      to_label: "Москва Центр",
      price_rub: 100,
      seats_total: 3,
      seats_taken: 1,
    }),
    makeRide({
      from_label: "Казань",
      to_label: "Аэропорт",
      price_rub: 500,
      seats_total: 4,
      seats_taken: 3,
    }),
    makeRide({
      from_label: "Центр",
      to_label: "ЖК Царёво",
      price_rub: null,
      seats_total: 2,
      seats_taken: 2,
    }),
  ];

  it("без фильтров возвращает все поездки", () => {
    expect(applyFilters(rides, DEFAULT_FILTERS)).toHaveLength(3);
  });

  it("фильтрует по direction (from_label)", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, direction: "царёво" });
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.from_label.toLowerCase() + r.to_label.toLowerCase()).toContain("царёво");
    }
  });

  it("фильтрует по direction (to_label)", () => {
    const result = applyFilters(rides, { ...DEFAULT_FILTERS, direction: "аэропорт" });
    expect(result).toHaveLength(1);
    expect(result[0]?.to_label).toBe("Аэропорт");
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
    expect(result[0]?.from_label).toBe("ЖК Царёво");
  });

  it("пустой список rides → пустой результат", () => {
    expect(applyFilters([], DEFAULT_FILTERS)).toHaveLength(0);
  });

  it("favoritesOnly=true с favoriteIds оставляет только поездки от избранных водителей", () => {
    const DRIVER_A = "550e8400-e29b-41d4-a716-446655440001";
    const DRIVER_B = "550e8400-e29b-41d4-a716-446655440002";
    const ridesAB = [makeRide({ driver_id: DRIVER_A }), makeRide({ driver_id: DRIVER_B })];
    const result = applyFilters(
      ridesAB,
      { ...DEFAULT_FILTERS, favoritesOnly: true },
      new Set([DRIVER_A]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.driver_id).toBe(DRIVER_A);
  });

  it("favoritesOnly=true без favoriteIds не фильтрует", () => {
    const ridesTwo = [makeRide({}), makeRide({})];
    expect(applyFilters(ridesTwo, { ...DEFAULT_FILTERS, favoritesOnly: true })).toHaveLength(2);
  });
});
