import type { NotifyPayload } from "./types.js";

const DEDUP_TTL_MS = 5 * 60 * 1000;

export function buildDedupKey(payload: NotifyPayload): string {
  const targetId = payload.target_id ?? payload.message_id ?? payload.ride_id ?? "";
  const date = new Date().toISOString().slice(0, 10);
  return `${payload.user_id}:${payload.category}:${targetId}:${date}`;
}

export function checkAndSet(cache: Map<string, number>, key: string, now = Date.now()): boolean {
  // Cleanup expired
  for (const [k, expiresAt] of cache) {
    if (expiresAt <= now) cache.delete(k);
  }

  if (cache.has(key)) return false;

  cache.set(key, now + DEDUP_TTL_MS);
  return true;
}
