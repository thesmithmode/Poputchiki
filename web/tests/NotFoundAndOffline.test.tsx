import "@testing-library/jest-dom/vitest";
import { act, renderHook } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "../src/hooks/useOnlineStatus";

vi.mock("../src/lib/api", () => ({
  apiFetch: vi.fn().mockRejectedValue(new Error("network")),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super("ApiError");
      this.status = status;
      this.body = body;
    }
  },
}));

const MOCK_ME_STATE = {
  status: "ok" as const,
  user: {
    id: "test-user-id",
    display_name: "Test User",
    onboarded: true,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    role: "user" as const,
  },
};

vi.mock("../src/hooks/useMe", () => ({
  useMe: () => MOCK_ME_STATE,
  useBootMe: () => MOCK_ME_STATE,
}));

vi.mock("../src/hooks/useRides", () => ({
  useRides: () => ({ isPending: false, isError: false, data: { rides: [] }, isFetching: false }),
}));

import { App } from "../src/App";

describe("NotFoundPage", () => {
  beforeEach(() => {
    window.location.hash = "#/this-does-not-exist-xyz";
  });
  afterEach(() => {
    window.location.hash = "";
  });

  it("показывает страницу 404 для несуществующего маршрута", async () => {
    render(<App />);
    await screen.findByTestId("not-found", {}, { timeout: 3000 });
    expect(screen.getByText("Страница не найдена")).toBeInTheDocument();
  });

  it("кнопка 'На главную' присутствует", async () => {
    render(<App />);
    await screen.findByTestId("not-found", {}, { timeout: 3000 });
    expect(screen.getByRole("button", { name: "На главную" })).toBeInTheDocument();
  });
});

describe("useOnlineStatus", () => {
  it("возвращает true когда navigator.onLine=true", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it("переключается в false при событии offline", () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
  });

  it("переключается обратно в true при событии online", () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});

describe("OfflineBanner", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    window.location.hash = "";
  });

  it("скрыт когда online", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<App />);
    await screen.findByTestId("app-root");
    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("отображается при событии offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    render(<App />);
    await screen.findByTestId("app-root");
    act(() => {
      Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
      window.dispatchEvent(new Event("offline"));
    });
    await screen.findByTestId("offline-banner", {}, { timeout: 2000 });
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });
});
