import { getTokens } from "./tokenStore";

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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const tokens = getTokens();
  const authHeader = tokens ? { Authorization: `Bearer ${tokens.access}` } : {};
  const csrfToken = getCsrfToken();
  const csrfHeader = csrfToken ? { "X-CSRF-Token": csrfToken } : {};
  const res = await fetch(`${API_BASE}${resolvePath(path)}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeader, ...csrfHeader, ...init?.headers },
    ...init,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}
