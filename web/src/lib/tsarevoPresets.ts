import type { AddressSuggestion } from "../components/AddressAutocomplete";
import { PRESETS_RAW, type PresetEntry } from "./presetsData";

export const TSAREVO_PRESETS: AddressSuggestion[] = PRESETS_RAW.map((p) => ({
  label: p.label,
  source: "preset" as const,
  coords: { lat: p.lat, lng: p.lng },
}));

const STOP_TOKENS = new Set([
  "ул",
  "улица",
  "д",
  "дом",
  "г",
  "город",
  "пр",
  "проспект",
  "пер",
  "переулок",
  "с",
  "село",
  "пгт",
]);

// Нормализация: lowercase, ё→е, разбиваем по non-(буква/цифра), убираем stop-токены.
// JS \b не работает для кириллицы без u-флага, поэтому делаем явный токенайзер.
export function normalize(s: string): string {
  const lower = s.toLowerCase().replace(/ё/g, "е");
  const tokens = lower.split(/[^a-zа-я0-9]+/i).filter((t) => t && !STOP_TOKENS.has(t));
  return tokens.join(" ");
}

interface IndexedPreset {
  entry: PresetEntry;
  suggestion: AddressSuggestion;
  haystackTokens: Set<string>;
}

const INDEX: IndexedPreset[] = PRESETS_RAW.map((entry, idx) => {
  const suggestion = TSAREVO_PRESETS[idx];
  if (!suggestion) throw new Error(`presets index drift at ${idx}`);
  const parts = [normalize(entry.label), ...(entry.aliases ?? []).map(normalize)];
  const haystackTokens = new Set(parts.flatMap((p) => p.split(" ").filter(Boolean)));
  return { entry, suggestion, haystackTokens };
});

// AND-логика: каждый токен запроса должен либо точно совпасть с токеном haystack,
// либо быть строгим префиксом (длиной ≥3, чтобы "тук" подцеплял "тукая", но "4" не цеплял "47").
function tokenMatches(qToken: string, haystack: Set<string>): boolean {
  if (haystack.has(qToken)) return true;
  if (qToken.length < 3) return false;
  for (const h of haystack) {
    if (h.startsWith(qToken)) return true;
  }
  return false;
}

export function getMatchingPresets(query: string): AddressSuggestion[] {
  const q = normalize(query);
  if (!q) return [];
  const tokens = q.split(" ").filter(Boolean);
  if (tokens.length === 0) return [];
  return INDEX.filter(({ haystackTokens }) =>
    tokens.every((t) => tokenMatches(t, haystackTokens)),
  ).map(({ suggestion }) => suggestion);
}
