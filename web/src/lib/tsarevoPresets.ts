import type { AddressSuggestion } from "../components/AddressAutocomplete";

// Статические точки для ЖК Царёво и популярных направлений из/в Казань.
// Nominatim не знает новый ЖК Царёво (нет на OSM), поэтому хардкод.
export const TSAREVO_PRESETS: AddressSuggestion[] = [
  {
    label: "ЖК Царёво, главный КПП, Кощаковское с.п.",
    source: "preset",
    coords: { lat: 55.6935, lng: 49.2912 },
  },
  {
    label: "ЖК Царёво, корп. 1–3, Кощаковское с.п.",
    source: "preset",
    coords: { lat: 55.6942, lng: 49.2925 },
  },
  {
    label: "ЖК Царёво, корп. 4–6, Кощаковское с.п.",
    source: "preset",
    coords: { lat: 55.6927, lng: 49.2938 },
  },
  {
    label: "ЖК Царёво, корп. 7–10, Кощаковское с.п.",
    source: "preset",
    coords: { lat: 55.6918, lng: 49.295 },
  },
  {
    label: "ЖК Царёво, школа № 186, Кощаковское с.п.",
    source: "preset",
    coords: { lat: 55.694, lng: 49.29 },
  },
  {
    label: "Казанский аэропорт (KZN)",
    source: "preset",
    coords: { lat: 55.6062, lng: 49.2784 },
  },
  {
    label: "ТЦ Кольцо, ул. Петербургская, Казань",
    source: "preset",
    coords: { lat: 55.7933, lng: 49.1205 },
  },
  {
    label: "Казань, ж.д. вокзал (Казань-Пассажирская)",
    source: "preset",
    coords: { lat: 55.796, lng: 49.1073 },
  },
  {
    label: "ТЦ МЕГА Казань, пр. Победы",
    source: "preset",
    coords: { lat: 55.863, lng: 49.099 },
  },
  {
    label: "Казань, ул. Баумана (центр)",
    source: "preset",
    coords: { lat: 55.7867, lng: 49.1218 },
  },
  {
    label: "Старое Шигалеево, Пестречинский р-н",
    source: "preset",
    coords: { lat: 55.61, lng: 49.38 },
  },
];

const TSAREVO_KEYWORDS = /царев|tsarevo|жк|кощак/i;

export function getMatchingPresets(query: string): AddressSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return TSAREVO_PRESETS;
  if (TSAREVO_KEYWORDS.test(q)) {
    return TSAREVO_PRESETS.filter(
      (p) => p.label.toLowerCase().includes(q) || TSAREVO_KEYWORDS.test(q),
    );
  }
  return TSAREVO_PRESETS.filter((p) => p.label.toLowerCase().includes(q));
}
