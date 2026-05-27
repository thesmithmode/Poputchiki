function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, "е");
}

export function fuzzyMatchSaved(query: string, name: string): boolean {
  const q = normalize(query);
  const n = normalize(name);
  if (q.length === 0 || n.length === 0) return false;
  if (q[0] !== n[0]) return false;

  let ni = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ni < n.length && n[ni] !== q[qi]) ni++;
    if (ni >= n.length) return false;
    ni++;
  }
  return true;
}
