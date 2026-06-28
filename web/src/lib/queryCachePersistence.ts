export const QUERY_CACHE_KEY = "pp_qc_v1";
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {}
}
