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

import { createElement } from "react";
import { MeContext, useBootMe, useMe } from "../src/hooks/useMe";
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

describe("useBootMe — boot-цикл", () => {
  it("SENTINEL: когда /auth/telegram возвращает user — GET /users/me НЕ вызывается", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      access_token: "access.token.test",
      refresh_token: "refresh.token.test",
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useBootMe());

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

    const { result } = renderHook(() => useBootMe());

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

    const { result } = renderHook(() => useBootMe());

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

    const { result } = renderHook(() => useBootMe());

    await waitFor(() => expect(result.current.status).toBe("banned"));

    expect(result.current).toMatchObject({
      status: "banned",
      reason: "нарушение правил",
      banned_at: "2026-01-01T00:00:00Z",
    });
  });

  it("статус error при сбое /auth/telegram", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("network fail"));

    const { result } = renderHook(() => useBootMe());

    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("статус loading в начале", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useBootMe());

    expect(result.current.status).toBe("loading");
  });

  it("REGRESSION: кэшированный ok НЕ перебивается transient-ошибкой при фоновой проверке", async () => {
    // Симулируем: кэш есть + токены есть → boot пытается GET /users/me → 500
    // Ожидание: состояние остаётся ok (stale-while-revalidate), НЕ переходит в error
    const { getTelegramWebApp } = await import("../src/lib/telegram");
    vi.mocked(getTelegramWebApp).mockReturnValue({
      initData: "test",
      initDataUnsafe: { user: { id: 123 } },
    } as ReturnType<typeof getTelegramWebApp>);

    localStorage.setItem(
      "pp_tokens",
      JSON.stringify({ access: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.s", refresh: "ref" }),
    );
    localStorage.setItem(
      "pp_me_v1",
      JSON.stringify({ user: MOCK_USER, tgId: 123, at: Date.now() }),
    );

    // GET /users/me → 500
    mockedApiFetch.mockRejectedValueOnce(new Error("Internal Server Error"));

    const { result } = renderHook(() => useBootMe());

    // Начальное состояние из кэша — ok
    expect(result.current.status).toBe("ok");

    // Ждём пока boot() завершится (ошибка подавлена)
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    // Маленькая пауза чтобы boot() catch отработал
    await new Promise((r) => setTimeout(r, 50));

    // Состояние НЕ должно стать error
    expect(result.current.status).toBe("ok");

    vi.mocked(getTelegramWebApp).mockReturnValue(null);
  });

  it("REGRESSION: прогресс не идёт назад — фаза не откатывается после done", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      access_token: "tok",
      refresh_token: "ref",
      user: MOCK_USER,
    });

    const { result } = renderHook(() => useBootMe());

    const phases: string[] = [];
    await waitFor(() => {
      if (result.current.status === "loading") {
        phases.push(result.current.phase);
      }
      return result.current.status === "ok";
    });

    // Проверяем что фазы идут только вперёд (нет отката)
    const phaseOrder = { init: 0, auth: 1, profile: 2, done: 3 };
    for (let i = 1; i < phases.length; i++) {
      const prev = phaseOrder[phases[i - 1] as keyof typeof phaseOrder];
      const cur = phaseOrder[phases[i] as keyof typeof phaseOrder];
      expect(cur).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe("useMe — контекст", () => {
  it("читает состояние из MeContext.Provider", () => {
    const meState = { status: "ok" as const, user: MOCK_USER };

    const { result } = renderHook(() => useMe(), {
      wrapper: ({ children }) => createElement(MeContext.Provider, { value: meState }, children),
    });

    expect(result.current).toEqual(meState);
  });

  it("бросает ошибку без MeContext.Provider", () => {
    expect(() => {
      renderHook(() => useMe());
    }).toThrow("useMe: MeContext.Provider not found in tree");
  });

  it("возвращает loading state из контекста", () => {
    const loadingState = { status: "loading" as const, phase: "profile" as const };

    const { result } = renderHook(() => useMe(), {
      wrapper: ({ children }) =>
        createElement(MeContext.Provider, { value: loadingState }, children),
    });

    expect(result.current.status).toBe("loading");
  });

  it("REGRESSION: useMe в дочерних компонентах не запускает boot-цикл", () => {
    // Если useMe читает контекст — apiFetch НЕ вызывается
    const meState = { status: "ok" as const, user: MOCK_USER };

    renderHook(() => useMe(), {
      wrapper: ({ children }) => createElement(MeContext.Provider, { value: meState }, children),
    });

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
