import { describe, expect, it, vi } from "vitest";
import { createAuthRouter } from "../../../src/auth/authRouter";

vi.mock("../../../src/auth/verifyInitData", () => ({
  verifyInitData: vi.fn(() => ({
    user: { id: 99999, first_name: "Test", username: "testuser" },
    hash: "sentinel-hash-abc",
  })),
  TelegramAuthError: class extends Error {
    reason = "test";
  },
}));

vi.stubEnv("BOT_TOKEN", "1234567890:ABCDEFGHIJKLMNabcdefghijklmn123456");
vi.stubEnv("JWT_SECRET", "test-jwt-secret-at-least-32-chars!!");

function makeSql() {
  const tx = vi
    .fn()
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([] as any) // SET LOCAL ROLE poputchiki_service (withSystem)
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([] as any) // INSERT nonce (count undefined ≠ 0 → not replay)
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([] as any) // SELECT user (new user)
    // biome-ignore lint/suspicious/noExplicitAny: mock tx
    .mockResolvedValueOnce([{ id: "00000000-0000-4000-a000-000000000099", role: "user" }] as any); // INSERT users RETURNING

  // biome-ignore lint/suspicious/noExplicitAny: mock sql
  return { begin: vi.fn((fn: (arg: unknown) => unknown) => fn(tx)) } as any;
}

describe("POST /auth/telegram — cookie sentinel", () => {
  it("response sets tg_uid with SameSite=None;Secure", async () => {
    const router = createAuthRouter(makeSql());
    const res = await router.request("/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: "auth_date=1745000000&user=%7B%7D&hash=abc" }),
    });

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const tgCookie = cookies.find((c: string) => c.startsWith("tg_uid="));
    expect(tgCookie).toBeTruthy();
    expect(tgCookie).toContain("SameSite=None");
    expect(tgCookie).toContain("Secure");
  });

  it("response sets csrf_token with SameSite=None;Secure", async () => {
    const router = createAuthRouter(makeSql());
    const res = await router.request("/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: "auth_date=1745000000&user=%7B%7D&hash=abc" }),
    });

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const csrfCookie = cookies.find((c: string) => c.startsWith("csrf_token="));
    expect(csrfCookie).toBeTruthy();
    expect(csrfCookie).toContain("SameSite=None");
    expect(csrfCookie).toContain("Secure");
  });

  it("SENTINEL: no cookie uses SameSite=Lax", async () => {
    const router = createAuthRouter(makeSql());
    const res = await router.request("/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: "auth_date=1745000000&user=%7B%7D&hash=abc" }),
    });

    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBeGreaterThan(0);
    for (const cookie of cookies) {
      expect(cookie).not.toContain("SameSite=Lax");
      expect(cookie).not.toContain("SameSite=Strict");
    }
  });
});
