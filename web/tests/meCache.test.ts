import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeUser } from "../src/hooks/useMe";
import { clearMeCache, readMeCache, writeMeCache } from "../src/lib/meCache";

const MOCK_USER: MeUser = {
  id: "u1",
  display_name: "Test User",
  onboarded: true,
  is_banned: false,
  ban_reason: null,
  banned_at: null,
  role: "user",
};

describe("meCache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("readMeCache возвращает null если кэш пуст", () => {
    expect(readMeCache(12345)).toBeNull();
  });

  it("writeMeCache + readMeCache возвращает пользователя", () => {
    writeMeCache(MOCK_USER, 12345);
    expect(readMeCache(12345)).toEqual(MOCK_USER);
  });

  it("readMeCache возвращает null если tgId не совпадает", () => {
    writeMeCache(MOCK_USER, 12345);
    expect(readMeCache(99999)).toBeNull();
  });

  it("readMeCache возвращает null если кэш просрочен (>30min)", () => {
    writeMeCache(MOCK_USER, 12345);
    const original = Date.now;
    Date.now = vi.fn(() => original() + 31 * 60 * 1000 + 1);
    expect(readMeCache(12345)).toBeNull();
    Date.now = original;
  });

  it("readMeCache возвращает данные если кэш не просрочен (<30min)", () => {
    writeMeCache(MOCK_USER, 12345);
    const original = Date.now;
    Date.now = vi.fn(() => original() + 29 * 60 * 1000);
    expect(readMeCache(12345)).toEqual(MOCK_USER);
    Date.now = original;
  });

  it("clearMeCache удаляет кэш", () => {
    writeMeCache(MOCK_USER, 12345);
    clearMeCache();
    expect(readMeCache(12345)).toBeNull();
  });

  it("readMeCache игнорирует невалидный JSON", () => {
    localStorage.setItem("pp_me_v1", "not-json{{");
    expect(readMeCache(12345)).toBeNull();
  });

  it("writeMeCache перезаписывает предыдущий кэш", () => {
    writeMeCache(MOCK_USER, 12345);
    const updated: MeUser = { ...MOCK_USER, display_name: "Updated" };
    writeMeCache(updated, 12345);
    expect(readMeCache<MeUser>(12345)?.display_name).toBe("Updated");
  });

  it("readMeCache при is_banned=true возвращает banned-пользователя", () => {
    const banned: MeUser = {
      ...MOCK_USER,
      is_banned: true,
      ban_reason: "spam",
      banned_at: "2026-01-01T00:00:00Z",
    };
    writeMeCache(banned, 12345);
    expect(readMeCache(12345)).toEqual(banned);
  });
});
