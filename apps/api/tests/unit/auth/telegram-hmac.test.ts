/**
 * Unit tests for Telegram initData HMAC verifier.
 * Tests run without DB — pure crypto logic.
 */
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TelegramAuthError, verifyInitData } from "../../../src/auth/verifyInitData";

const BOT_TOKEN = "1234567890:AABBCCDDEEFFaabbccddeeff1234567890Ab";

const TEST_USER = { id: 123456789, first_name: "Test", username: "testuser" };
const TEST_AUTH_DATE = 1_745_000_000;

function computeHash(fields: Record<string, string>): string {
  const sorted = Object.entries(fields).sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

function buildInitData(
  overrides: Partial<Record<string, string>> = {},
  hashOverride?: string,
): string {
  const fields: Record<string, string> = {
    auth_date: String(TEST_AUTH_DATE),
    user: JSON.stringify(TEST_USER),
    ...overrides,
  };
  const hash = hashOverride ?? computeHash(fields);
  return `${Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")}&hash=${hash}`;
}

const fixedClock = (nowSeconds: number) => ({ now: () => nowSeconds });

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("verifyInitData — happy path", () => {
  it("accepts valid initData with correct hash and fresh auth_date", () => {
    const initData = buildInitData();
    const result = verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE));
    expect(result.user.id).toBe(TEST_USER.id);
    expect(result.user.first_name).toBe(TEST_USER.first_name);
    expect(result.authDate).toBe(TEST_AUTH_DATE);
  });

  it("accepts initData 4m59s after auth_date (within ±5min window)", () => {
    const initData = buildInitData();
    expect(() =>
      verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE + 4 * 60 + 59)),
    ).not.toThrow();
  });

  it("accepts initData 4m59s before auth_date (negative age, within window)", () => {
    const initData = buildInitData();
    expect(() =>
      verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE - 4 * 60 - 59)),
    ).not.toThrow();
  });

  it("accepts initData at exactly 5m00s old (boundary inclusive)", () => {
    const initData = buildInitData();
    expect(() =>
      verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE + 300)),
    ).not.toThrow();
  });

  it("uses default system clock when no clock argument provided", () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = buildInitData({ auth_date: String(now) });
    const result = verifyInitData(initData, BOT_TOKEN);
    expect(result.user.id).toBe(TEST_USER.id);
  });
});

// ---------------------------------------------------------------------------
// Invalid hash
// ---------------------------------------------------------------------------

describe("verifyInitData — invalid hash", () => {
  it("throws TelegramAuthError when hash is missing", () => {
    const initData = `auth_date=${TEST_AUTH_DATE}&user=${encodeURIComponent(JSON.stringify(TEST_USER))}`;
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      TelegramAuthError,
    );
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "missing hash",
    );
  });

  it("throws TelegramAuthError when hash is tampered (one char changed)", () => {
    const good = buildInitData();
    const hashMatch = good.match(/&hash=([0-9a-f]{64})$/);
    if (!hashMatch) throw new Error("no hash in initData");
    const captured = hashMatch[1];
    if (!captured) throw new Error("no hash captured");
    const badHash = captured.replace(/.$/, (c) => (c === "a" ? "b" : "a"));
    const tampered = good.replace(/&hash=[0-9a-f]{64}$/, `&hash=${badHash}`);
    expect(() => verifyInitData(tampered, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      TelegramAuthError,
    );
    expect(() => verifyInitData(tampered, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid hash",
    );
  });

  it("throws TelegramAuthError when hash has wrong length", () => {
    const initData = buildInitData({}, "abc123");
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid hash",
    );
  });

  it("throws TelegramAuthError when hash is all zeros", () => {
    const initData = buildInitData({}, "0".repeat(64));
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid hash",
    );
  });

  it("throws TelegramAuthError when a data field was tampered after signing", () => {
    const initData = buildInitData();
    const tampered = initData.replace(
      `auth_date=${encodeURIComponent(String(TEST_AUTH_DATE))}`,
      "auth_date=1000000000",
    );
    expect(() => verifyInitData(tampered, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid hash",
    );
  });

  it("throws TelegramAuthError when wrong bot token is used for verification", () => {
    const initData = buildInitData();
    expect(() =>
      verifyInitData(
        initData,
        "9999999999:WRONG_TOKEN_WRONG_TOKEN_WRONG_TOKEN_W",
        fixedClock(TEST_AUTH_DATE),
      ),
    ).toThrow("invalid hash");
  });
});

// ---------------------------------------------------------------------------
// Expired auth_date
// ---------------------------------------------------------------------------

describe("verifyInitData — expired auth_date", () => {
  it("throws TelegramAuthError when auth_date is older than 5 minutes", () => {
    const initData = buildInitData();
    const clock = fixedClock(TEST_AUTH_DATE + 5 * 60 + 1);
    expect(() => verifyInitData(initData, BOT_TOKEN, clock)).toThrow(TelegramAuthError);
    expect(() => verifyInitData(initData, BOT_TOKEN, clock)).toThrow("expired");
  });

  it("throws TelegramAuthError when auth_date is in the future by >5 minutes", () => {
    const initData = buildInitData();
    const clock = fixedClock(TEST_AUTH_DATE - 5 * 60 - 1);
    expect(() => verifyInitData(initData, BOT_TOKEN, clock)).toThrow(TelegramAuthError);
    expect(() => verifyInitData(initData, BOT_TOKEN, clock)).toThrow("expired");
  });

  it("throws at exactly 5m01s old (just past boundary)", () => {
    const initData = buildInitData();
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE + 301))).toThrow(
      "expired",
    );
  });
});

// ---------------------------------------------------------------------------
// Malformed input
// ---------------------------------------------------------------------------

describe("verifyInitData — malformed input", () => {
  it("throws TelegramAuthError when user field is missing", () => {
    const fields: Record<string, string> = { auth_date: String(TEST_AUTH_DATE) };
    const hash = computeHash(fields);
    const initData = `auth_date=${TEST_AUTH_DATE}&hash=${hash}`;
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "missing user",
    );
  });

  it("throws TelegramAuthError when user JSON is malformed", () => {
    const fields: Record<string, string> = {
      auth_date: String(TEST_AUTH_DATE),
      user: "{not-json}",
    };
    const hash = computeHash(fields);
    const initData = `auth_date=${TEST_AUTH_DATE}&user=${encodeURIComponent("{not-json}")}&hash=${hash}`;
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid user json",
    );
  });

  it("throws TelegramAuthError when user.id is missing", () => {
    const userNoId = { first_name: "Test" };
    const fields: Record<string, string> = {
      auth_date: String(TEST_AUTH_DATE),
      user: JSON.stringify(userNoId),
    };
    const hash = computeHash(fields);
    const initData =
      `auth_date=${TEST_AUTH_DATE}` +
      `&user=${encodeURIComponent(JSON.stringify(userNoId))}` +
      `&hash=${hash}`;
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "invalid user.id",
    );
  });

  it("throws TelegramAuthError when auth_date is missing but hash is valid", () => {
    const fields: Record<string, string> = { user: JSON.stringify(TEST_USER) };
    const hash = computeHash(fields);
    const initData = `user=${encodeURIComponent(JSON.stringify(TEST_USER))}&hash=${hash}`;
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      TelegramAuthError,
    );
    expect(() => verifyInitData(initData, BOT_TOKEN, fixedClock(TEST_AUTH_DATE))).toThrow(
      "missing auth_date",
    );
  });
});
