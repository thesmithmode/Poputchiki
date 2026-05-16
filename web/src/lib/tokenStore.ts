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

// Декодирует sub из JWT payload без верификации подписи.
// Нужно для сравнения сохранённого tgId с текущим пользователем Telegram.
export function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const part = parts[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return payload.sub != null ? String(payload.sub) : null;
  } catch {
    return null;
  }
}
