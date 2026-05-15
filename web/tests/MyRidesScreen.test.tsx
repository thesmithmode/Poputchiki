import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MyRidesScreen } from "../src/screens/MyRidesScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/hooks/useRolePreference", () => ({
  useRolePreference: vi.fn(() => ({ role: "passenger", setRole: vi.fn() })),
}));

import { useRolePreference } from "../src/hooks/useRolePreference";
import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseRolePref = vi.mocked(useRolePreference);

const MOCK_RIDE = {
  id: "550e8400-e29b-41d4-a716-446655440100",
  driver_id: "550e8400-e29b-41d4-a716-446655440200",
  from_label: "ЖК Царёво",
  from_lat: 55.8945,
  from_lng: 49.2043,
  to_label: "ТЦ Кольцо",
  to_lat: 55.7887,
  to_lng: 49.1222,
  departure_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  price_rub: 200,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
  driver_display_name: "Иван",
  driver_photo_url: null,
  driver_tg_id: 12345,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <MyRidesScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("MyRidesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseRolePref.mockReturnValue({ role: "passenger", setRole: vi.fn() });
  });

  it("рендерится с заголовком", () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    expect(screen.getByText("Мои поездки")).toBeInTheDocument();
  });

  it("показывает оба сегмент-таба роли", () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    expect(screen.getByTestId("role-driver")).toBeInTheDocument();
    expect(screen.getByTestId("role-passenger")).toBeInTheDocument();
  });

  it("показывает оба сегмент-таба времени", () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    expect(screen.getByTestId("when-future")).toBeInTheDocument();
    expect(screen.getByTestId("when-past")).toBeInTheDocument();
  });

  it("default — passenger + future если useRolePref=passenger", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/mine?role=passenger&when=future");
    });
    expect(screen.getByTestId("role-passenger")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("when-future")).toHaveAttribute("aria-selected", "true");
  });

  it("default — driver если useRolePref=driver", async () => {
    mockedUseRolePref.mockReturnValue({ role: "driver", setRole: vi.fn() });
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/mine?role=driver&when=future");
    });
  });

  it("клик по role-driver обновляет запрос", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/mine?role=passenger&when=future");
    });
    fireEvent.click(screen.getByTestId("role-driver"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/mine?role=driver&when=future");
    });
  });

  it("клик по when-past обновляет запрос", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    fireEvent.click(screen.getByTestId("when-past"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith("/rides/mine?role=passenger&when=past");
    });
  });

  it("показывает empty state когда нет поездок (future)", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("my-rides-empty")).toHaveTextContent("Нет предстоящих поездок");
    });
  });

  it("показывает empty state для прошлых поездок", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    fireEvent.click(screen.getByTestId("when-past"));
    await waitFor(() => {
      expect(screen.getByTestId("my-rides-empty")).toHaveTextContent("Нет завершённых поездок");
    });
  });

  it("рендерит карточку поездки из ответа", async () => {
    mockedApiFetch.mockResolvedValue({ rides: [MOCK_RIDE] });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("ЖК Царёво")).toBeInTheDocument();
      expect(screen.getByText("ТЦ Кольцо")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("my-rides-empty")).not.toBeInTheDocument();
  });

  it("показывает ошибку при сбое API", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network"));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("my-rides-error")).toBeInTheDocument();
    });
  });

  it("кнопка назад существует", () => {
    mockedApiFetch.mockResolvedValue({ rides: [] });
    renderScreen();
    expect(screen.getByTestId("back-btn")).toBeInTheDocument();
  });
});
