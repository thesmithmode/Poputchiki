const KEY = "pp_me_v1";
const TTL_MS = 30 * 60 * 1000;

type Stored = { user: unknown; tgId: number; at: number };

export function readMeCache<T>(tgId: number): T | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s: Stored = JSON.parse(raw);
    if (s.tgId !== tgId) return null;
    if (Date.now() - s.at > TTL_MS) return null;
    return s.user as T;
  } catch {
    return null;
  }
}

export function writeMeCache(user: unknown, tgId: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ user, tgId, at: Date.now() } satisfies Stored));
  } catch {}
}

export function clearMeCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
