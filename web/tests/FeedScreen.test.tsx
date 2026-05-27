import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MeContext } from "../src/contexts/MeContext";
import type { MeState } from "../src/hooks/useMe";
import { FeedScreen } from "../src/screens/FeedScreen";
import type { Ride } from "../src/types/ride";

vi.mock("../src/hooks/useRealtime", () => ({
  useRealtime: vi.fn(),
}));

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

import { ApiError, apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

const ME_STATE: MeState = {
  status: "ok",
  user: {
    id: "current-user",
    display_name: "Test User",
    onboarded: true,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    role: "user",
  },
};

function makeRide(overrides: Partial<Ride> = {}): Ride {
  return {
    id: crypto.randomUUID(),
    driver_id: crypto.randomUUID(),
    from_label: "ЖК Царёво, д. 5",
    from_lat: 55.7558,
    from_lng: 37.6173,
    to_label: "ул. Баумана",
    to_lat: 55.7963,
    to_lng: 49.1093,
    departure_at: new Date(Date.now() + 3_600_000).toISOString(),
    price_rub: 150,
    seats_total: 3,
    seats_taken: 1,
    status: "active",
    comment: null,
    created_at: new Date().toISOString(),
    driver_display_name: "Иван Иванов",
    driver_avg_stars: null,
    driver_reviews_count: 0,
    ...overrides,
  };
}

function mockApi(rides: Ride[] | Error): void {
  mockedApiFetch.mockImplementation(async (path) => {
    const url = String(path);
    if (url.startsWith("/ride-requests/mine")) return { requests: [] };
    if (url.startsWith("/rides?")) {
      if (rides instanceof Error) throw rides;
      return { rides, nextCursor: null };
    }
    throw new Error(`Unexpected apiFetch call: ${url}`);
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MeContext.Provider value={ME_STATE}>{ui}</MeContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FeedScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("показывает состояние загрузки пока запрос выполняется", () => {
    mockedApiFetch.mockImplementation((path) => {
      if (String(path).startsWith("/ride-requests/mine")) {
        return Promise.resolve({ requests: [] });
      }
      return new Promise(() => {});
    });

    renderWithQuery(<FeedScreen />);

    expect(screen.getByTestId("loading-skeleton")).toBeInTheDocument();
  });

  it("отображает список поездок когда данные получены", async () => {
    mockApi([
      makeRide({ from_label: "Откуда-1", to_label: "Куда-1" }),
      makeRide({ from_label: "Откуда-2", to_label: "Куда-2" }),
      makeRide({ from_label: "Откуда-3", to_label: "Куда-3" }),
    ]);

    renderWithQuery(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByText("Откуда-1")).toBeInTheDocument();
      expect(screen.getByText("Откуда-2")).toBeInTheDocument();
      expect(screen.getByText("Откуда-3")).toBeInTheDocument();
    });
  });

  it("показывает сообщение об отсутствии поездок при пустом списке", async () => {
    mockApi([]);

    renderWithQuery(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument();
    });
  });

  it("показывает сообщение об ошибке при сбое запроса", async () => {
    mockApi(new ApiError(500, { error: "Internal Server Error" }));

    renderWithQuery(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка/i)).toBeInTheDocument();
    });
  });

  it("переключает плотность списка по кнопке", async () => {
    mockApi([makeRide()]);

    renderWithQuery(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-density")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-density"));

    expect(localStorage.getItem("pp_density")).toBe("compact");
  });

  it("открывает панель фильтров по кнопке", async () => {
    mockApi([makeRide(), makeRide()]);

    renderWithQuery(<FeedScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-filters")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("toggle-filters"));

    expect(screen.getByTestId("toggle-filters")).toHaveAttribute("aria-pressed", "true");
  });
});
