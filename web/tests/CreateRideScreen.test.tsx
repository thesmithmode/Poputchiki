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

  it("успешный submit вызывает POST /api/rides", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "new-ride-id" });
    renderScreen();
    fillRequiredFields();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/rides",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("показывает ошибку при сбое API", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("Network error"));
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
    mockedApiFetch.mockResolvedValueOnce({ id: "x" });
    renderScreen();
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("price-free-checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const [, init] = mockedApiFetch.mock.calls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.price_rub).toBeNull();
    });
  });

  it("кнопка submit есть на экране", () => {
    renderScreen();
    expect(screen.getByTestId("submit-btn")).toBeInTheDocument();
  });
});
