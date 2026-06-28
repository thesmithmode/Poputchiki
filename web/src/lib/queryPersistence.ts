import { type DehydratedState, type QueryClient, dehydrate } from "@tanstack/react-query";

export const PERSISTED_QUERY_CACHE_KEY = "pp_qc_v1";
export const PERSISTED_QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

function isSensitiveQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === "saved-addresses";
}

export function dehydratePersistentQueryCache(queryClient: QueryClient): DehydratedState {
  return dehydrate(queryClient, {
    shouldDehydrateQuery: (query) => !isSensitiveQueryKey(query.queryKey),
  });
}

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(PERSISTED_QUERY_CACHE_KEY);
  } catch {}
}
