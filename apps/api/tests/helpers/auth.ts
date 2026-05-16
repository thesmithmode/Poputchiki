import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import { sign } from "hono/jwt";

// Вычисляет sess_bind = HMAC(secret, jti).slice(0,32) — повторяет логику cookie.ts.
export function signSessionBinding(secret: string, jti: string): string {
  return createHmac("sha256", secret).update(jti).digest("hex").slice(0, 32);
}

// Извлекает jti из JWT payload (без проверки подписи — только для тестов).
export function extractJti(token: string): string {
  const parts = token.split(".");
  const b64 = parts[1];
  if (!b64) throw new Error("Invalid JWT: no payload");
  const payload = JSON.parse(Buffer.from(b64, "base64url").toString()) as { jti?: string };
  if (!payload.jti) throw new Error(`Token missing jti: ${token.slice(0, 30)}...`);
  return payload.jti;
}

// Cookie: `sess_bind=<value>` для передачи в headers.Cookie
export function sessBind(secret: string, token: string): string {
  return signSessionBinding(secret, extractJti(token));
}

// Полный набор auth headers: Authorization + Cookie
export function authHeaders(
  secret: string,
  token: string,
): { Authorization: string; Cookie: string } {
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `sess_bind=${sessBind(secret, token)}`,
  };
}

// makeToken-helper для unit-тестов с jti по умолчанию
export async function makeAccessToken(
  secret: string,
  user: { id: string; tgId: number; role?: string },
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(user.tgId),
      uid: user.id,
      typ: "access",
      role: user.role ?? "user",
      jti: randomUUID(),
      iat: now,
      exp: now + 3600,
      ...overrides,
    },
    secret,
  );
}
