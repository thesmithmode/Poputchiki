import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("leaflet", () => ({
  default: {
    map: vi.fn(() => ({
      setView: vi.fn().mockReturnThis(),
      remove: vi.fn(),
      on: vi.fn(),
    })),
    tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
    marker: vi.fn(() => ({
      addTo: vi.fn().mockReturnThis(),
      bindPopup: vi.fn().mockReturnThis(),
    })),
    icon: vi.fn(),
  },
  map: vi.fn(() => ({
    setView: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    on: vi.fn(),
  })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  marker: vi.fn(() => ({
    addTo: vi.fn().mockReturnThis(),
    bindPopup: vi.fn().mockReturnThis(),
  })),
  icon: vi.fn(),
}));

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

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
    departure_at: new Date(Date.now() + 3600000).toISOString(),
    price_rub: 150,
    seats_total: 3,
    seats_taken: 1,
    status: "active",
    comment: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FeedScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("показывает состояние загрузки пока запрос выполняется", async () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithQuery(<FeedScreen />);
    expect(
      screen.getByText(/Загрузка/i) || document.querySelector("[data-testid='loading-skeleton']"),
    ).toBeTruthy();
  });

  it("отображает список поездок когда данные получены", async () => {
    const rides = [
      makeRide({ from_label: "Откуда-1", to_label: "Куда-1" }),
      makeRide({ from_label: "Откуда-2", to_label: "Куда-2" }),
      makeRide({ from_label: "Откуда-3", to_label: "Куда-3" }),
    ];
    mockedApiFetch.mockResolvedValueOnce({ rides, nextCursor: null });
    renderWithQuery(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByText("Откуда-1")).toBeInTheDocument();
      expect(screen.getByText("Откуда-2")).toBeInTheDocument();
      expect(screen.getByText("Откуда-3")).toBeInTheDocument();
    });
  });

  it("показывает сообщение об отсутствии поездок при пустом списке", async () => {
    mockedApiFetch.mockResolvedValueOnce({ rides: [], nextCursor: null });
    renderWithQuery(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByText(/Ничего не найдено/i)).toBeInTheDocument();
    });
  });

  it("показывает сообщение об ошибке при сбое запроса", async () => {
    const { ApiError } = await import("../src/lib/api");
    mockedApiFetch.mockRejectedValueOnce(new ApiError(500, { error: "Internal Server Error" }));
    renderWithQuery(<FeedScreen />);
    await waitFor(() => {
      expect(screen.getByText(/ошибка/i) || screen.getByText(/что-то пошло не так/i)).toBeTruthy();
    });
  });

});
