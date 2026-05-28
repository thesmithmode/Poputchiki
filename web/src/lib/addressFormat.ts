export interface CompactAddressOptions {
  maxLen: number;
}

function stripNoise(label: string): string {
  return (
    label
      // Region/country noise (project-specific)
      // NB: \b is not reliable for Cyrillic in JS without unicode rules → use plain substr matches.
      .replace(/,?\s*г\.?\s*Казань/gi, "")
      .replace(/,?\s*Казань/gi, "")
      .replace(/,?\s*Республика\s+Татарстан/gi, "")
      .replace(/,?\s*Татарстан/gi, "")
      .replace(/,?\s*Россия/gi, "")
      // Common abbreviations
      .replace(/\bулица\b/gi, "ул.")
      .replace(/\bпроспект\b/gi, "пр.")
      .replace(/\bпереулок\b/gi, "пер.")
      .replace(/\bбульвар\b/gi, "бул.")
      .replace(/\bшоссе\b/gi, "ш.")
      .replace(/\bнабережная\b/gi, "наб.")
      .replace(/^\s*,\s*/, "")
      .replace(/,\s*$/, "")
      .trim()
  );
}

export function compactAddressLabel(label: string, options: CompactAddressOptions): string {
  if (!label) return label;
  const cleaned = stripNoise(label) || label.trim();
  if (cleaned.length <= options.maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, options.maxLen - 1))}…`;
}

export function compactAddressTitle(original: string, compact: string): string | undefined {
  const o = original ?? "";
  const c = compact ?? "";
  return o && c && o !== c ? o : undefined;
}
