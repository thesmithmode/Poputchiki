import {
  type DehydratedState,
  type Query,
  type QueryClient,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";

export const QUERY_CACHE_KEY = "pp_qc_v1";
const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

type DehydratedQueryLike = DehydratedState["queries"][number];

function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  const [scope, kind] = queryKey;

  // Persist only anonymous/public feed lists. Per-user data (support tickets,
  // notifications, ride requests, ride details, admin data, profile/me) must
  // never be written to localStorage because it can survive logout/account switch.
  return scope === "rides" && kind === "list";
}

function isPersistableQuery(query: Query): boolean {
  return isPersistableQueryKey(query.queryKey);
}

function filterPersistedState(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;
  const dehydrated = state as DehydratedState;
  if (!Array.isArray(dehydrated.queries)) return state;

  return {
    ...dehydrated,
    queries: dehydrated.queries.filter((query: DehydratedQueryLike) =>
      isPersistableQueryKey(query.queryKey),
    ),
  } satisfies DehydratedState;
}

export function hydratePersistedQueryCache(queryClient: QueryClient): void {
  try {
    const raw = localStorage.getItem(QUERY_CACHE_KEY);
    if (!raw) return;
    const { ts, state } = JSON.parse(raw) as { ts: number; state: unknown };
    if (Date.now() - ts < CACHE_MAX_AGE) hydrate(queryClient, filterPersistedState(state));
  } catch {}
}

export function persistQueryClientCache(queryClient: QueryClient): void {
  try {
    localStorage.setItem(
      QUERY_CACHE_KEY,
      JSON.stringify({
        ts: Date.now(),
        state: dehydrate(queryClient, { shouldDehydrateQuery: isPersistableQuery }),
      }),
    );
  } catch {}
}

export function clearPersistedQueryCache(): void {
  try {
    localStorage.removeItem(QUERY_CACHE_KEY);
  } catch {}
}
