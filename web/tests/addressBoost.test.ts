import { describe, expect, it } from "vitest";
import type { AddressSuggestion } from "../src/components/AddressAutocomplete";
import { byTsarevoFirst } from "../src/lib/addressBoost";

function geo(label: string, fullDisplay?: string): AddressSuggestion {
  const base: AddressSuggestion = { label, source: "geocode", coords: { lat: 0, lng: 0 } };
  return fullDisplay === undefined ? base : { ...base, fullDisplay };
}

describe("byTsarevoFirst", () => {
  it("буст царёво наверх — совпадение в fullDisplay", () => {
    const items: AddressSuggestion[] = [
      geo("ул. Тукая 31, Альметьевск", "ул. Габдуллы Тукая, 31, Альметьевск, Татарстан, Россия"),
      geo(
        "ул. Тукая 31, Новое Шигалеево",
        "ул. Габдуллы Тукая, 31, Новое Шигалеево, Пестречинский район, Татарстан, Россия",
      ),
      geo("ул. Тукая 31, Зеленодольск", "ул. Тукая, 31, Зеленодольск, Татарстан, Россия"),
    ];
    items.sort(byTsarevoFirst);
    expect(items[0]?.fullDisplay).toContain("Шигалеево");
  });

  it("ловит 'Царёво' и 'Царево' (ё/е)", () => {
    const items: AddressSuggestion[] = [
      geo("Альметьевск ул. Тукая 5"),
      geo("Царево Village, ул. Тукая, 5"),
    ];
    items.sort(byTsarevoFirst);
    expect(items[0]?.label).toContain("Царево");
  });

  it("стабилен когда совпадений нет — порядок не меняется", () => {
    const a = geo("ул. Тукая 31, Альметьевск");
    const b = geo("ул. Тукая 31, Челны");
    const items = [a, b];
    items.sort(byTsarevoFirst);
    expect(items).toEqual([a, b]);
  });

  it("стабилен когда оба царёво — порядок не меняется", () => {
    const a = geo("Тукая 4, Царёво");
    const b = geo("Тукая 9, Царёво");
    const items = [a, b];
    items.sort(byTsarevoFirst);
    expect(items).toEqual([a, b]);
  });

  it("использует label как fallback если fullDisplay пустой", () => {
    const items: AddressSuggestion[] = [geo("Альметьевск ул. Тукая 5"), geo("Шигалеево, Тукая 5")];
    items.sort(byTsarevoFirst);
    expect(items[0]?.label).toContain("Шигалеево");
  });
});
