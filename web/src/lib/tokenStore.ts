const KEY = "pp_tokens";

interface Tokens {
  access: string;
  refresh: string;
}

export function getTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(KEY, JSON.stringify({ access, refresh }));
}

export function clearTokens(): void {
  localStorage.removeItem(KEY);
}
