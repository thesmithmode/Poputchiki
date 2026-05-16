import type { AddressSuggestion } from "../components/AddressAutocomplete";
import { PRESETS_RAW, type PresetEntry } from "./presetsData";

export const TSAREVO_PRESETS: AddressSuggestion[] = PRESETS_RAW.map((p) => ({
  label: p.label,
  source: "preset" as const,
  coords: { lat: p.lat, lng: p.lng },
}));

// Нормализация: lowercase, ё→е, убираем точки/запятые, "ул"/"д"/"г" как стандалон-токены,
// схлопываем повторные пробелы. Так "ул. Тукая, д.31" и "г.Тукая 31" приводятся к "тукая 31".
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,]/g, " ")
    .replace(/\b(ул|улица|д|дом|г|город|пр|проспект|пер|переулок|с|село|пгт)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface IndexedPreset {
  entry: PresetEntry;
  suggestion: AddressSuggestion;
  haystack: string;
}

const INDEX: IndexedPreset[] = PRESETS_RAW.map((entry, idx) => {
  const suggestion = TSAREVO_PRESETS[idx];
  if (!suggestion) throw new Error(`presets index drift at ${idx}`);
  return {
    entry,
    suggestion,
    haystack: [normalize(entry.label), ...(entry.aliases ?? []).map(normalize)].join(" | "),
  };
});

export function getMatchingPresets(query: string): AddressSuggestion[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  return INDEX.filter(({ haystack }) => tokens.every((t) => haystack.includes(t))).map(
    ({ suggestion }) => suggestion,
  );
}
