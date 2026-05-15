import { getTokens, setTokens } from "./tokenStore";

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}`);
  }
}

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function resolvePath(path: string): string {
  if (path.startsWith("/auth/") || path.startsWith("/api/")) return path;
  return `/api${path}`;
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

// Промис рефреша на лету — параллельные 401 ждут один общий refresh,
// не запускают N конкурирующих.
let refreshInFlight: Promise<boolean> | null = null;

/* c8 ignore start -- test-only utility for module state reset */
export function _resetRefreshState(): void {
  refreshInFlight = null;
}
/* c8 ignore stop */

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  const run = (async () => {
    const tokens = getTokens();
    if (!tokens) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: tokens.refresh }),
      });
      if (!res.ok) return false;
      const body = (await res.json().catch(() => null)) as {
        access_token?: string;
        refresh_token?: string;
      } | null;
      if (!body?.access_token || !body?.refresh_token) return false;
      setTokens(body.access_token, body.refresh_token);
      return true;
    } catch {
      return false;
    }
  })();
  refreshInFlight = run;
  try {
    return await run;
  } finally {
    refreshInFlight = null;
  }
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  const tokens = getTokens();
  const authHeader = tokens ? { Authorization: `Bearer ${tokens.access}` } : {};
  const csrfToken = getCsrfToken();
  const csrfHeader = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  return fetch(`${API_BASE}${resolvePath(path)}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader, ...csrfHeader, ...init?.headers },
    ...init,
  });
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  // /auth/* эндпоинты не должны вызывать refresh-loop при 401 (telegramAuth/refresh сами по себе)
  const isAuthEndpoint = path.startsWith("/auth/");

  let res = await doFetch(path, init);
  if (res.status === 401 && !isAuthEndpoint) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(path, init);
    }
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
