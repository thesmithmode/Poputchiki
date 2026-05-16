import type { AddressSuggestion } from "../components/AddressAutocomplete";
import { PRESETS_RAW } from "./presetsData";

export const TSAREVO_PRESETS: AddressSuggestion[] = PRESETS_RAW.map((p) => ({
  label: p.label,
  source: "preset" as const,
  coords: { lat: p.lat, lng: p.lng },
}));

export function getMatchingPresets(query: string): AddressSuggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return TSAREVO_PRESETS;
  return TSAREVO_PRESETS.filter((p) => p.label.toLowerCase().includes(q));
}
