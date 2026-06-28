import type { Query } from "@tanstack/react-query";

export const QUERY_CACHE_KEY = "pp_qc_v1";
export const QUERY_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

type PersistedQuery = { queryKey?: unknown };
type PersistedState = { queries?: PersistedQuery[]; mutations?: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isPersistableQueryKey(queryKey: unknown): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey.length === 5 &&
    queryKey[0] === "rides" &&
    queryKey[1] === "list" &&
    (typeof queryKey[2] === "string" || queryKey[2] === null) &&
    (typeof queryKey[3] === "string" || queryKey[3] === null) &&
    (typeof queryKey[4] === "string" || queryKey[4] === null)
  );
}

export function shouldPersistQuery(query: Query): boolean {
  return isPersistableQueryKey(query.queryKey);
}

export function filterPersistedQueryState(state: unknown): unknown {
  if (!isRecord(state)) return state;
  const persisted = state as PersistedState;
  return {
    ...state,
    queries: Array.isArray(persisted.queries)
      ? persisted.queries.filter((query) => isPersistableQueryKey(query.queryKey))
      : [],
    mutations: [],
  };
}

export function clearQueryCacheStorage(): void {
  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {}
}
