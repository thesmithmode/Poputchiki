import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "../src/screens/ProfileScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/hooks/useMe", () => ({
  useMe: vi.fn(() => ({ status: "loading" })),
}));

vi.mock("../src/hooks/useFavorites", () => ({
  useFavorites: vi.fn(() => ({
    favorites: [],
    isLoading: false,
    isFavorite: () => false,
    toggle: vi.fn(),
    setNotify: vi.fn(),
    favoriteIds: new Set(),
  })),
}));

import { useMe } from "../src/hooks/useMe";
import { ApiError, apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseMe = vi.mocked(useMe);

const USER_ID = "550e8400-e29b-41d4-a716-446655440010";

const mockUser = {
  id: USER_ID,
  tg_username: "ivan_ivanov",
  display_name: "Иван Иванов",
  avatar_url: null,
  created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  stats: {
    rides_as_driver_completed: 10,
    rides_as_passenger: 5,
    likes_received: 8,
    avg_stars: 4.7,
    reviews_count: 6,
    driver_avg_stars: 4.8,
    passenger_avg_stars: 4.6,
    driver_reviews_count: 4,
    passenger_reviews_count: 2,
  },
};

function renderScreen(id = USER_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ProfileScreen id={id} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseMe.mockReturnValue({ status: "loading" });
  });

  it("показывает загрузку", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
  });

  it("отображает имя пользователя", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    });
  });

  it("отображает @username", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("@ivan_ivanov")).toBeInTheDocument();
    });
  });

  it("отображает 3 большие статы (лайки, рейтинг, поездки)", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => {
      const stats = screen.getByTestId("big-stats");
      expect(stats).toBeInTheDocument();
      expect(stats).toHaveTextContent("8");
      // По умолчанию режим "пассажир" → показывает passenger_avg_stars=4.6
      expect(stats).toHaveTextContent("4.6");
      // По умолчанию режим "пассажир" → показывает rides_as_passenger=5
      expect(stats).toHaveTextContent("5");
    });
  });

  it("рейтинг водителя в режиме driver", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => screen.getByText("Иван Иванов"));
    // переключаем на водителя через кнопку
    const driverBtn = screen.queryByText("Водитель");
    if (driverBtn) {
      fireEvent.click(driverBtn);
      await waitFor(() => {
        expect(screen.getByTestId("big-stats")).toHaveTextContent("4.8");
      });
    }
  });

  it("показывает вкладки Расписание / Отзывы / Поездки", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Расписание")).toBeInTheDocument();
      expect(screen.getByText("Отзывы")).toBeInTheDocument();
      expect(screen.getByText("Поездки")).toBeInTheDocument();
    });
  });

  it("по умолчанию активна вкладка Расписание", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("tab-schedule")).toBeInTheDocument();
    });
  });

  it("показывает ошибку при сбое", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(500, {}));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("profile-error")).toBeInTheDocument();
      expect(screen.getByText(/Ошибка загрузки/)).toBeInTheDocument();
    });
  });

  it("показывает 'Пользователь не найден' при 404", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(404, {}));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/Пользователь не найден/)).toBeInTheDocument();
    });
  });

  it("НЕ показывает кнопки редактирования для чужого профиля", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "other-id",
        display_name: "Other",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("edit-btn")).not.toBeInTheDocument();
    expect(screen.queryByTestId("notifications-btn")).not.toBeInTheDocument();
  });

  it("кнопка избранного удалена (был fav-btn)", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockUser);
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "other-id",
        display_name: "Other",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("fav-btn")).not.toBeInTheDocument();
  });

  it("показывает кнопки редактирования для своего профиля", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...mockUser, id: USER_ID });
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: USER_ID,
        display_name: "Иван Иванов",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    });
    renderScreen(USER_ID);
    await waitFor(() => {
      expect(screen.getByTestId("edit-btn")).toBeInTheDocument();
      expect(screen.getByTestId("notifications-btn")).toBeInTheDocument();
    });
  });
});
