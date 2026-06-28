interface Tokens {
  access: string;
}

let accessToken: string | null = null;

export function getTokens(): Tokens | null {
  return accessToken ? { access: accessToken } : null;
}

export function setTokens(access: string): void {
  accessToken = access;
}

export function clearTokens(): void {
  accessToken = null;
  try {
    localStorage.removeItem("pp_tokens");
  } catch {
    // localStorage can be unavailable in privacy modes; auth state is memory-only.
  }
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
