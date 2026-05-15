import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateRideScreen } from "../src/screens/CreateRideScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/lib/telegram", () => ({
  getTelegramWebApp: vi.fn(() => undefined),
}));

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

/** Geo-ответ для ЖК Царёво (Казань) */
const GEO_FROM = [{ lat: "55.8945", lon: "49.2043", display_name: "ЖК Царёво, Казань" }];
/** Geo-ответ для ул. Баумана */
const GEO_TO = [{ lat: "55.7887", lon: "49.1222", display_name: "ул. Баумана, Казань" }];

function renderScreen(initialPath = "/rides/new") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <CreateRideScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId("input-from"), { target: { value: "ЖК Царёво" } });
  fireEvent.change(screen.getByTestId("input-to"), { target: { value: "ул. Баумана" } });
  // date already has default; time already has default
}

describe("CreateRideScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерится с заголовком", () => {
    renderScreen();
    expect(screen.getByText("Новая поездка")).toBeInTheDocument();
  });

  it("показывает поля маршрута", () => {
    renderScreen();
    expect(screen.getByTestId("input-from")).toBeInTheDocument();
    expect(screen.getByTestId("input-to")).toBeInTheDocument();
  });

  it("показывает поля даты и времени", () => {
    renderScreen();
    expect(screen.getByTestId("input-date")).toBeInTheDocument();
    expect(screen.getByTestId("input-time")).toBeInTheDocument();
  });

  it("показывает кнопки выбора мест 1-4", () => {
    renderScreen();
    expect(screen.getByTestId("seats-1")).toBeInTheDocument();
    expect(screen.getByTestId("seats-2")).toBeInTheDocument();
    expect(screen.getByTestId("seats-3")).toBeInTheDocument();
    expect(screen.getByTestId("seats-4")).toBeInTheDocument();
  });

  it("выбирает количество мест кнопкой", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("seats-2"));
    expect(screen.getByTestId("seats-2")).toHaveStyle({ background: "#e0f2fe" });
  });

  it("чекбокс договорная скрывает поле цены", () => {
    renderScreen();
    expect(screen.getByTestId("input-price")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("price-free-checkbox"));
    expect(screen.queryByTestId("input-price")).not.toBeInTheDocument();
  });

  it("показывает поле комментария", () => {
    renderScreen();
    expect(screen.getByTestId("input-comment")).toBeInTheDocument();
  });

  it("чекбокс Регулярный раскрывает поля weekdays", () => {
    renderScreen();
    expect(screen.queryByTestId("recurring-fields")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    expect(screen.getByTestId("recurring-fields")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-0")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-4")).toBeInTheDocument();
  });

  it("выбор дней недели переключает кнопки", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    fireEvent.click(screen.getByTestId("weekday-0"));
    expect(screen.getByTestId("weekday-0")).toHaveStyle({ background: "#e0f2fe" });
    fireEvent.click(screen.getByTestId("weekday-0"));
    expect(screen.getByTestId("weekday-0")).toHaveStyle({ background: "#fff" });
  });

  it("показывает ошибку если откуда пустое", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("submit-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Укажите откуда");
    });
  });

  it("показывает ошибку если куда пустое", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("input-from"), { target: { value: "ЖК Царёво" } });
    fireEvent.click(screen.getByTestId("submit-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Укажите куда");
    });
  });

  it("показывает ошибку если Регулярный но нет дней", async () => {
    renderScreen();
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    // не выбираем weekdays
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Выберите дни недели");
    });
  });

  it("показывает ошибку если geocode не разрешил координаты", async () => {
    // Оба геокода возвращают пустой массив
    mockedApiFetch.mockResolvedValue([]);
    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось найти адрес");
    });
    // POST /rides не вызывался
    const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
    expect(ridesCalls).toHaveLength(0);
  });

  it("показывает ошибку если один geocode не разрешился", async () => {
    // from разрешился, to — нет
    mockedApiFetch
      .mockResolvedValueOnce(GEO_FROM) // /geocode/search для from
      .mockResolvedValueOnce([]); // /geocode/search для to
    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось найти адрес");
    });
  });

  it("успешный submit: вызывает геокод и POST /api/rides с правильными coords (Казань, не Москва)", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(GEO_FROM) // geocode from
      .mockResolvedValueOnce(GEO_TO) // geocode to
      .mockResolvedValueOnce({ id: "new-ride-id" }); // POST /rides

    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
      expect(ridesCalls).toHaveLength(1);
      const [, init] = ridesCalls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      // Не московские координаты
      expect(body.from_lat).not.toBe(55.75);
      expect(body.from_lng).not.toBe(37.61);
      expect(body.to_lat).not.toBe(55.8);
      expect(body.to_lng).not.toBe(37.65);
      // Казанские координаты из мока
      expect(body.from_lat).toBeCloseTo(55.8945, 3);
      expect(body.from_lng).toBeCloseTo(49.2043, 3);
      expect(body.to_lat).toBeCloseTo(55.7887, 3);
      expect(body.to_lng).toBeCloseTo(49.1222, 3);
    });
  });

  it("при падении geocode API показывает ошибку координат", async () => {
    mockedApiFetch.mockRejectedValue(new Error("Network error"));
    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось найти адрес");
    });
  });

  it("показывает ошибку при сбое API /rides", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(GEO_FROM) // geocode from
      .mockResolvedValueOnce(GEO_TO) // geocode to
      .mockRejectedValueOnce(new Error("Network error")); // POST /rides

    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось создать поездку");
    });
  });

  it("price_rub передаётся null при договорной", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(GEO_FROM)
      .mockResolvedValueOnce(GEO_TO)
      .mockResolvedValueOnce({ id: "x" });

    renderScreen();
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("price-free-checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
      const [, init] = ridesCalls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.price_rub).toBeNull();
    });
  });

  it("кнопка submit есть на экране", () => {
    renderScreen();
    expect(screen.getByTestId("submit-btn")).toBeInTheDocument();
  });
});
