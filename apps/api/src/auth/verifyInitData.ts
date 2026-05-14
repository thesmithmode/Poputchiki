import { createHmac, timingSafeEqual } from "node:crypto";

export class TelegramAuthError extends Error {
  constructor(public readonly reason: string) {
    super(`Telegram auth failed: ${reason}`);
    this.name = "TelegramAuthError";
  }
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedInitData {
  user: TelegramUser;
  authDate: number;
  hash: string;
}

export interface Clock {
  now(): number;
}

const MAX_AGE_SECONDS = 60 * 60; // 1 hour — Telegram WebView can reuse initData within session
const EXPECTED_HASH_LENGTH = 64; // SHA-256 → 32 bytes → 64 hex chars

export function verifyInitData(
  initData: string,
  botToken: string,
  clock: Clock = { now: () => Math.floor(Date.now() / 1000) },
): VerifiedInitData {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) {
    throw new TelegramAuthError("missing hash");
  }

  // Data check string: all fields except hash, sorted by key, joined by \n
  const entries = [...params.entries()]
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  // Secret key: HMAC-SHA256("WebAppData", botToken)
  const secretKey = new Uint8Array(createHmac("sha256", "WebAppData").update(botToken).digest());

  // Expected hash: HMAC-SHA256(secretKey, dataCheckString) as hex
  const expectedHex = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Constant-time compare (timingSafeEqual requires equal-length buffers)
  if (hash.length !== EXPECTED_HASH_LENGTH) {
    throw new TelegramAuthError("invalid hash");
  }
  const expectedBuf = new Uint8Array(Buffer.from(expectedHex, "utf8"));
  const providedBuf = new Uint8Array(Buffer.from(hash, "utf8"));
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    throw new TelegramAuthError("invalid hash");
  }

  // auth_date freshness: ±5 minutes
  const authDateStr = params.get("auth_date");
  if (!authDateStr) {
    throw new TelegramAuthError("missing auth_date");
  }
  const authDate = Number(authDateStr);
  const age = clock.now() - authDate;
  if (Math.abs(age) > MAX_AGE_SECONDS) {
    throw new TelegramAuthError("expired");
  }

  // Parse user
  const userStr = params.get("user");
  if (!userStr) {
    throw new TelegramAuthError("missing user");
  }
  let user: TelegramUser;
  try {
    user = JSON.parse(userStr) as TelegramUser;
  } catch {
    throw new TelegramAuthError("invalid user json");
  }
  if (!user.id || typeof user.id !== "number") {
    throw new TelegramAuthError("invalid user.id");
  }

  return { user, authDate, hash };
}
