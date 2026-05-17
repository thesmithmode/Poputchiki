import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RideDetailScreen } from "../src/screens/RideDetailScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/hooks/useMe", () => ({
  useMe: vi.fn(() => ({
    status: "ok",
    user: {
      id: "passenger-user-id",
      display_name: "Test User",
      onboarded: true,
      is_banned: false,
      ban_reason: null,
      banned_at: null,
      role: "user",
    },
  })),
}));

import { ApiError, apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

const RIDE_ID = "550e8400-e29b-41d4-a716-446655440000";
const DRIVER_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockRide = {
  id: RIDE_ID,
  driver_id: DRIVER_ID,
  from_label: "ЖК Царёво, д. 5",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "ул. Баумана",
  to_lat: 55.7963,
  to_lng: 49.1093,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
  driver: {
    id: DRIVER_ID,
    first_name: "Иван",
    last_name: "Иванов",
    tg_id: 9999,
    likes_received_count: 5,
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago, not new
  },
  passengers: [],
};

function renderScreen(id = RIDE_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <RideDetailScreen id={id} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("RideDetailScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("показывает загрузку пока запрос выполняется", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("detail-loading")).toBeInTheDocument();
  });

  it("отображает from и to метки", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("ЖК Царёво, д. 5")).toBeInTheDocument();
      expect(screen.getByText("ул. Баумана")).toBeInTheDocument();
    });
  });

  it("отображает имя водителя", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    });
  });

  it("отображает цену в рублях", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/150\s*₽/)).toBeInTheDocument();
    });
  });

  it("отображает 'Бесплатно' при price_rub = null", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...mockRide, price_rub: null });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Бесплатно")).toBeInTheDocument();
    });
  });

  it("отображает количество свободных мест", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/2 из 3/)).toBeInTheDocument();
    });
  });

  it("telegram-кнопка отображается для чужой поездки", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("telegram-link")).toBeInTheDocument();
    });
  });

  it("показывает комментарий когда он есть", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...mockRide, comment: "Тихая поездка" });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Тихая поездка")).toBeInTheDocument();
    });
  });

  it("не показывает секцию комментария при comment = null", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...mockRide, comment: null });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("driver-card")).toBeInTheDocument();
    });
    expect(screen.queryByText("Комментарий")).not.toBeInTheDocument();
  });

  it("показывает бейдж 'новый сосед' для нового водителя (< 30 дней)", async () => {
    const newDriver = {
      ...mockRide.driver,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ ...mockRide, driver: newDriver });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("новый сосед")).toBeInTheDocument();
    });
  });

  it("не показывает бейдж 'новый сосед' для старого водителя (> 30 дней)", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("driver-card")).toBeInTheDocument();
    });
    expect(screen.queryByText("новый сосед")).not.toBeInTheDocument();
  });

  it("показывает список пассажиров", async () => {
    const passengers = [
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        first_name: "Мария",
        last_name: "Петрова",
        tg_id: 8888,
        likes_received_count: 2,
      },
    ];
    mockedApiFetch.mockResolvedValueOnce({ ...mockRide, passengers });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/Мария/)).toBeInTheDocument();
    });
  });

  it("показывает ошибку при сбое загрузки", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(500, { error: "server error" }));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("detail-error")).toBeInTheDocument();
      expect(screen.getByText(/Ошибка загрузки/)).toBeInTheDocument();
    });
  });

  it("показывает 'Поездка не найдена' при 404", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(404, { error: "not found" }));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText(/Поездка не найдена/)).toBeInTheDocument();
    });
  });

  it("отображает кнопку 'Откликнуться'", async () => {
    mockedApiFetch.mockResolvedValueOnce(mockRide);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("respond-btn")).toBeInTheDocument();
    });
  });
});
