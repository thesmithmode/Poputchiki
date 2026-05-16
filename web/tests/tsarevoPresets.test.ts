import { describe, expect, it } from "vitest";
import { getMatchingPresets, normalize } from "../src/lib/tsarevoPresets";

describe("normalize", () => {
  it("ё → е и lowercase", () => {
    expect(normalize("Царёво")).toBe("царево");
  });

  it("убирает 'ул.', 'д.', точки и запятые", () => {
    expect(normalize("ул. Тукая, д. 31")).toBe("тукая 31");
  });

  it("'г.Тукая 31' → 'тукая 31' (г как стандалон-токен)", () => {
    expect(normalize("г.Тукая 31")).toBe("тукая 31");
  });

  it("схлопывает повторные пробелы", () => {
    expect(normalize("Тукая   31")).toBe("тукая 31");
  });
});

describe("getMatchingPresets", () => {
  it("пустая строка → пустой список (пресеты только при typing)", () => {
    expect(getMatchingPresets("")).toEqual([]);
    expect(getMatchingPresets("   ")).toEqual([]);
  });

  it("'тукая 4' матчит preset д.4 через алиас", () => {
    const res = getMatchingPresets("тукая 4");
    expect(res.some((s) => s.label.includes("д. 4"))).toBe(true);
  });

  it("'ул. Тукая, д.13' матчит preset д.13", () => {
    const res = getMatchingPresets("ул. Тукая, д.13");
    expect(res.some((s) => s.label.includes("д. 13"))).toBe(true);
  });

  it("'г.Тукая 47' матчит preset д.47", () => {
    const res = getMatchingPresets("г.Тукая 47");
    expect(res.some((s) => s.label.includes("д. 47"))).toBe(true);
  });

  it("'тукая 31' возвращает пусто (нет в presets, Nominatim покроет)", () => {
    expect(getMatchingPresets("тукая 31")).toEqual([]);
  });

  it("'мега' матчит ТЦ МЕГА", () => {
    const res = getMatchingPresets("мега");
    expect(res.some((s) => s.label.includes("МЕГА"))).toBe(true);
  });

  it("'аэропорт' матчит KZN", () => {
    const res = getMatchingPresets("аэропорт");
    expect(res.some((s) => s.label.includes("аэропорт"))).toBe(true);
  });

  it("'царево' (без ё) матчит все дома ЖК Царёво", () => {
    const res = getMatchingPresets("царево");
    expect(res.filter((s) => s.label.startsWith("Царёво Village")).length).toBeGreaterThanOrEqual(
      6,
    );
  });

  it("token AND логика: 'царево 4' матчит только дом 4, не все дома", () => {
    const res = getMatchingPresets("царево 4");
    const houses = res.filter((s) => s.label.startsWith("Царёво Village"));
    expect(houses.length).toBe(1);
    expect(houses[0]?.label).toContain("д. 4");
  });
});
