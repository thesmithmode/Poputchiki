import { describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";
import { syncTelegramAvatar } from "../../../src/users/avatarCache";
import { readJson } from "../../helpers/json";

vi.mock("../../../src/auth/verifyInitData", () => ({
  verifyInitData: vi.fn(() => ({
    user: { id: 99999, first_name: "Иван", last_name: "Петров", username: "ivan" },
    hash: "sentinel-hash-xyz",
  })),
  TelegramAuthError: class extends Error {
    reason = "test";
  },
}));

vi.mock("../../../src/users/avatarCache", () => ({
  syncTelegramAvatar: vi.fn(() => Promise.resolve()),
}));

vi.stubEnv("BOT_TOKEN", "1234567890:ABCDEFGHIJKLMNabcdefghijklmn123456");
vi.stubEnv("JWT_SECRET", "test-jwt-secret-at-least-32-chars!!");

function makeSql(userRow?: Record<string, unknown>, existingRow?: Record<string, unknown> | null) {
  const row = userRow ?? {
    id: "aaaaaaaa-0000-4000-a000-000000000001",
    role: "user",
    display_name: "Иван Петров",
    onboarded: false,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
  };
  const selectedRows: Record<string, unknown>[] = existingRow ? [existingRow] : [];
  const tx = vi
    .fn()
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([] as any) // SET LOCAL ROLE (withSystem)
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([] as any) // INSERT nonce
    .mockResolvedValueOnce(selectedRows) // SELECT user by tg_id
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([row] as any); // INSERT users RETURNING

  // biome-ignore lint/suspicious/noExplicitAny: mock sql
  return { begin: vi.fn((fn: (arg: unknown) => unknown) => fn(tx)) } as any;
}

const REQUEST_OPTS = {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ initData: "auth_date=1745000000&user=%7B%7D&hash=abc" }),
};

describe("POST /auth/telegram — response body содержит профиль пользователя", () => {
  it("возвращает access_token и refresh_token", async () => {
    const res = await createAuthRouter(makeSql()).request("/telegram", REQUEST_OPTS);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body.access_token).toBe("string");
    expect(typeof body.refresh_token).toBe("string");
  });

  it("возвращает user.id, user.display_name, user.onboarded, user.is_banned, user.role", async () => {
    const res = await createAuthRouter(makeSql()).request("/telegram", REQUEST_OPTS);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.user).toBeTruthy();
    expect(body.user.id).toBe("aaaaaaaa-0000-4000-a000-000000000001");
    expect(body.user.display_name).toBe("Иван Петров");
    expect(body.user.onboarded).toBe(false);
    expect(body.user.is_banned).toBe(false);
    expect(body.user.role).toBe("user");
    expect(body.user.ban_reason).toBeNull();
    expect(body.user.banned_at).toBeNull();
  });

  it("SENTINEL: display_name fallback к tgUser first_name если RETURNING не вернул display_name", async () => {
    // Старый SQL ответ без display_name (обратная совместимость)
    const res = await createAuthRouter(
      makeSql({ id: "bbbbbbbb-0000-4000-a000-000000000002", role: "user" }),
    ).request("/telegram", REQUEST_OPTS);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    // Fallback: имя из verifyInitData mock = "Иван Петров"
    expect(typeof body.user.display_name).toBe("string");
    expect(body.user.display_name.length).toBeGreaterThan(0);
    expect(body.user.is_banned).toBe(false);
    expect(body.user.onboarded).toBe(false);
  });

  it("SENTINEL: banned Telegram user is rejected before token minting", async () => {
    const res = await createAuthRouter(
      makeSql(undefined, {
        id: "cccccccc-0000-4000-a000-000000000003",
        role: "user",
        is_banned: true,
        deleted_at: null,
      }),
    ).request("/telegram", REQUEST_OPTS);

    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("account blocked");
  });

  it("SENTINEL: soft-deleted Telegram user is rejected before conflict upsert", async () => {
    const res = await createAuthRouter(
      makeSql(undefined, {
        id: "dddddddd-0000-4000-a000-000000000004",
        role: "user",
        is_banned: true,
        deleted_at: "2026-01-02T03:04:05.000Z",
      }),
    ).request("/telegram", REQUEST_OPTS);

    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("account blocked");
  });

  it("запускает best-effort синхронизацию Telegram-аватара при логине", async () => {
    vi.mocked(syncTelegramAvatar).mockClear();
    const res = await createAuthRouter(makeSql()).request("/telegram", REQUEST_OPTS);
    expect(res.status).toBe(200);
    expect(syncTelegramAvatar).toHaveBeenCalledWith(
      expect.anything(),
      "aaaaaaaa-0000-4000-a000-000000000001",
      99999,
    );
  });
});
