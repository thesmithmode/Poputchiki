import { createHash } from "node:crypto";
import type { NotifyPayload } from "./types.js";

const DEDUP_TTL_MS = 5 * 60 * 1000;
const WINDOW_SECS = 300;

export function buildDedupKey(payload: NotifyPayload, nowMs = Date.now()): string {
  const targetId = payload.target_id ?? payload.message_id ?? payload.ride_id ?? "";
  const window = Math.floor(nowMs / 1000 / WINDOW_SECS);
  const raw = `${payload.user_id}:${payload.category}:${targetId}:${window}`;
  return createHash("sha256").update(raw).digest("hex");
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
