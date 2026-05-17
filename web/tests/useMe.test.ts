import "@testing-library/jest-dom/vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/lib/telegram", () => ({
  getTelegramWebApp: vi.fn(() => null),
}));

import { useMe } from "../src/hooks/useMe";
import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

const MOCK_USER = {
  id: "user-uuid-001",
  display_name: "Тест Пользователь",
  onboarded: true,
  is_banned: false,
  ban_reason: null,
  banned_at: null,
  role: "user" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("useMe", () => {
  it("SENTINEL: когда /auth/telegram возвращает user — GET /users/me НЕ вызывается", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      access_token: "access.token.test",
      refresh_token: "refresh.token.test",
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe("ok"));

    const usersMeCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/users/me");
    expect(usersMeCalls).toHaveLength(0);

    const authCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/auth/telegram");
    expect(authCalls).toHaveLength(1);
  });

  it("когда токены есть (localStorage) — вызывает только GET /users/me, не /auth/telegram", async () => {
    localStorage.setItem(
      "pp_tokens",
      JSON.stringify({ access: "access.token.existing", refresh: "refresh.token.existing" }),
    );
    mockedApiFetch.mockResolvedValueOnce(MOCK_USER);

    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe("ok"));

    const authCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/auth/telegram");
    expect(authCalls).toHaveLength(0);

    const usersMeCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/users/me");
    expect(usersMeCalls).toHaveLength(1);
  });

  it("статус ok с правильными данными пользователя после auth", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      access_token: "tok",
      refresh_token: "ref",
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe("ok"));

    expect(result.current).toMatchObject({
      status: "ok",
      user: MOCK_USER,
    });
  });

  it("статус banned если пользователь забанен в auth response", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      access_token: "tok",
      refresh_token: "ref",
      user: {
        ...MOCK_USER,
        is_banned: true,
        ban_reason: "нарушение правил",
        banned_at: "2026-01-01T00:00:00Z",
      },
    });

    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe("banned"));

    expect(result.current).toMatchObject({
      status: "banned",
      reason: "нарушение правил",
      banned_at: "2026-01-01T00:00:00Z",
    });
  });

  it("статус error при сбое /auth/telegram", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("network fail"));

    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("статус loading в начале", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useMe());

    expect(result.current.status).toBe("loading");
  });
});
