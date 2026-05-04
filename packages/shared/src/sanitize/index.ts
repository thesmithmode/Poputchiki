export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function limitLength(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

export function sanitizeText(s: string, maxLen: number): string {
  return limitLength(normalizeWhitespace(stripHtml(s)), maxLen);
}
