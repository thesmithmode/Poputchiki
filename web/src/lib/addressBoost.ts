import type { AddressSuggestion } from "../components/AddressAutocomplete";

const TSAREVO_RE = /цар[её]во|шигалеево/i;

// Stable sort: совпадения с "Царёво" / "Новое Шигалеево" поднимаются наверх.
// Проверяем сначала fullDisplay (полный адрес от Nominatim), затем label —
// label обрезается до 4 частей и совпадение может быть скрыто.
export function byTsarevoFirst(a: AddressSuggestion, b: AddressSuggestion): number {
  const aT = TSAREVO_RE.test(a.fullDisplay ?? a.label);
  const bT = TSAREVO_RE.test(b.fullDisplay ?? b.label);
  return aT === bT ? 0 : aT ? -1 : 1;
}
