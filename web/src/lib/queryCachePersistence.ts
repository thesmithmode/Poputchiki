import type { Query } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

export const CACHE_KEY = "pp_qc_v1";
export const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

const SENSITIVE_QUERY_ROOTS = new Set<unknown>([queryKeys.savedAddresses.all[0]]);

export function shouldPersistQuery(query: Query): boolean {
  return !SENSITIVE_QUERY_ROOTS.has(query.queryKey[0]);
}

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}
