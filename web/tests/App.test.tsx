import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

type WindowWithTelegram = Window & {
  Telegram?:
    | {
        WebApp?: {
          colorScheme: "light" | "dark";
          onEvent: (...args: unknown[]) => void;
          ready: () => void;
        };
      }
    | undefined;
};

const w = () => window as unknown as WindowWithTelegram;

// Мок для useBootMe — изолируем App тесты от boot-логики
vi.mock("../src/hooks/useMe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/hooks/useMe")>();
  return {
    ...actual,
    useBootMe: vi.fn(() => ({
      status: "ok",
      user: {
        id: "test-user",
        display_name: "Тест",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    })),
  };
});

vi.mock("../src/lib/api", () => ({
  apiFetch: vi.fn(() => Promise.resolve({ rides: [], nextCursor: null })),
}));

vi.mock("../src/hooks/useRealtime", () => ({ useRealtime: vi.fn() }));
vi.mock("../src/hooks/useRides", () => ({
  useRides: vi.fn(() => ({
    data: { rides: [] },
    isLoading: false,
    isError: false,
    isFetching: false,
    dataUpdatedAt: null,
    refetch: vi.fn(),
  })),
}));
vi.mock("../src/hooks/useMyRideRequests", () => ({
  useMyRideRequests: vi.fn(() => new Map()),
}));
vi.mock("../src/hooks/useFavorites", () => ({
  useFavorites: vi.fn(() => ({
    isFavorite: vi.fn(() => false),
    toggle: vi.fn(),
    favoriteIds: new Set(),
  })),
}));
vi.mock("../src/hooks/useUnreadCount", () => ({
  useUnreadCount: vi.fn(() => 0),
}));

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.removeItem("pp_theme");
    w().Telegram = undefined;
  });

  it("рендерит главный маршрут без ошибок", () => {
    render(<App />);
    expect(screen.getByTestId("app-root")).toBeInTheDocument();
  });

  it("использует HashRouter (URL hash-based)", () => {
    render(<App />);
    expect(window.location.hash === "" || window.location.hash.startsWith("#/")).toBe(true);
  });

  it("подхватывает Telegram colorScheme=dark → класс dark на html (при system preference)", () => {
    localStorage.setItem("pp_theme", "system");
    w().Telegram = {
      WebApp: {
        colorScheme: "dark",
        onEvent: vi.fn(),
        ready: vi.fn(),
      },
    };
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("colorScheme=light → нет класса dark", () => {
    w().Telegram = {
      WebApp: {
        colorScheme: "light",
        onEvent: vi.fn(),
        ready: vi.fn(),
      },
    };
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("без window.Telegram не падает", () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it("REGRESSION: loading screen НЕ показывается когда status=ok", () => {
    render(<App />);
    // При status=ok — boot loading screen с прогресс-баром не должен быть в DOM
    expect(screen.queryByText("Запуск приложения…")).not.toBeInTheDocument();
    expect(screen.queryByText("Загрузка профиля…")).not.toBeInTheDocument();
    expect(screen.queryByText("Выполняется вход…")).not.toBeInTheDocument();
  });

  it("REGRESSION: при status=ok показывается основной контент, не loading screen", async () => {
    render(<App />);
    // Основной контент (app-root) присутствует
    await waitFor(() => {
      expect(screen.getByTestId("app-root")).toBeInTheDocument();
    });
    // Loading screen отсутствует
    expect(screen.queryByText("Запуск приложения…")).not.toBeInTheDocument();
  });
});

describe("App — boot loading screen", () => {
  it("REGRESSION: loading screen показывается только при status=loading", async () => {
    const { useBootMe } = await import("../src/hooks/useMe");
    vi.mocked(useBootMe).mockReturnValue({ status: "loading", phase: "auth" });

    render(<App />);

    expect(screen.getByText("Выполняется вход…")).toBeInTheDocument();
  });

  it("REGRESSION: loading screen НЕ показывается после перехода в ok", async () => {
    const { useBootMe } = await import("../src/hooks/useMe");
    vi.mocked(useBootMe).mockReturnValue({
      status: "ok",
      user: {
        id: "u",
        display_name: "U",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    });

    render(<App />);

    expect(screen.queryByText("Запуск приложения…")).not.toBeInTheDocument();
    expect(screen.queryByText("Выполняется вход…")).not.toBeInTheDocument();
    expect(screen.queryByText("Загрузка профиля…")).not.toBeInTheDocument();
    expect(screen.queryByText("Готово!")).not.toBeInTheDocument();
  });
});
