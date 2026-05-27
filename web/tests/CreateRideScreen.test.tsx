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

vi.mock("../src/hooks/useSavedAddresses", () => ({
  useSavedAddresses: () => ({
    addresses: [],
    create: vi.fn(),
    remove: vi.fn(),
    isCreating: false,
    isLoading: false,
  }),
}));

// Мокаем AddressAutocomplete на простой input с подставленными coords при изменении —
// поведение dropdown тестируется отдельно в AddressAutocomplete.test.tsx.
vi.mock("../src/components/AddressAutocomplete", () => {
  return {
    AddressAutocomplete: ({
      value,
      onChange,
      testId,
    }: {
      value: string;
      onChange: (v: string, c?: { lat: number; lng: number }) => void;
      testId?: string;
    }) => {
      const FAKE_COORDS: Record<string, { lat: number; lng: number }> = {
        "ЖК Царёво": { lat: 55.8945, lng: 49.2043 },
        "ул. Баумана": { lat: 55.7887, lng: 49.1222 },
      };
      return (
        <div>
          <input
            data-testid={testId}
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v, FAKE_COORDS[v]);
            }}
          />
        </div>
      );
    },
  };
});

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

function renderScreen(initialPath = "/rides/new") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <QueryClientProvider client={client}>
        <CreateRideScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  return { ...utils, client };
}

function fillFromTo() {
  // Mock автокомплита подставляет coords именно для этих labels.
  fireEvent.change(screen.getByTestId("input-from"), { target: { value: "ЖК Царёво" } });
  fireEvent.change(screen.getByTestId("input-to"), { target: { value: "ул. Баумана" } });
}

function goToStep2() {
  fillFromTo();
  fireEvent.click(screen.getByTestId("next-step-btn"));
}

function goToStep3() {
  goToStep2();
  fireEvent.click(screen.getByTestId("next-step-btn"));
}

describe("CreateRideScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерится с заголовком", () => {
    renderScreen();
    expect(screen.getByText("Новая поездка")).toBeInTheDocument();
  });

  it("step 1: показывает поля маршрута", () => {
    renderScreen();
    expect(screen.getByTestId("input-from")).toBeInTheDocument();
    expect(screen.getByTestId("input-to")).toBeInTheDocument();
  });

  it("step 1: показывает индикатор шага 1/3", () => {
    renderScreen();
    expect(screen.getByTestId("step-indicator")).toHaveTextContent("Шаг 1/3");
  });

  it("step 1 → step 2: показывает поля даты и времени после next", () => {
    renderScreen();
    goToStep2();
    expect(screen.getByTestId("input-date")).toBeInTheDocument();
    expect(screen.getByTestId("input-time")).toBeInTheDocument();
  });

  it("step 3: показывает поле ввода количества мест", () => {
    renderScreen();
    goToStep3();
    const input = screen.getByTestId("seats-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("number");
    expect(Number(input.value)).toBe(3);
  });

  it("step 3: изменяет количество мест через поле ввода", () => {
    renderScreen();
    goToStep3();
    const input = screen.getByTestId("seats-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "7" } });
    expect(Number(input.value)).toBe(7);
  });

  it("step 3: чекбокс договорная скрывает поле цены", () => {
    renderScreen();
    goToStep3();
    expect(screen.getByTestId("input-price")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("price-free-checkbox"));
    expect(screen.queryByTestId("input-price")).not.toBeInTheDocument();
  });

  it("step 3: показывает поле комментария", () => {
    renderScreen();
    goToStep3();
    expect(screen.getByTestId("input-comment")).toBeInTheDocument();
  });

  it("step 3: чекбокс Регулярный раскрывает поля weekdays", () => {
    renderScreen();
    goToStep3();
    expect(screen.queryByTestId("recurring-fields")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    expect(screen.getByTestId("recurring-fields")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-0")).toBeInTheDocument();
    expect(screen.getByTestId("weekday-4")).toBeInTheDocument();
  });

  it("step 3: выбор дней недели переключает кнопки", () => {
    renderScreen();
    goToStep3();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    fireEvent.click(screen.getByTestId("weekday-0"));
    expect(screen.getByTestId("weekday-0")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("weekday-0"));
    expect(screen.getByTestId("weekday-0")).toHaveAttribute("aria-pressed", "false");
  });

  it("step 1: показывает ошибку если откуда пустое при next", async () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("next-step-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Укажите откуда");
    });
  });

  it("step 1: показывает ошибку если куда пустое при next", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("input-from"), { target: { value: "ЖК Царёво" } });
    fireEvent.click(screen.getByTestId("next-step-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Укажите куда");
    });
  });

  it("step 1: ошибка если coords не выбраны из dropdown (произвольный текст)", async () => {
    renderScreen();
    fireEvent.change(screen.getByTestId("input-from"), { target: { value: "случайный текст" } });
    fireEvent.change(screen.getByTestId("input-to"), { target: { value: "другой текст" } });
    fireEvent.click(screen.getByTestId("next-step-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent(
        /Выберите адрес «Откуда» из списка подсказок/,
      );
    });
  });

  it("step 3: показывает ошибку если Регулярный но нет дней", async () => {
    renderScreen();
    goToStep3();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Выберите дни недели");
    });
  });

  it("step 3: успешный submit вызывает POST /rides с coords из dropdown — без повторного geocode", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "new-ride-id" });

    renderScreen();
    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
      expect(ridesCalls).toHaveLength(1);
      const [, init] = ridesCalls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.from_lat).toBeCloseTo(55.8945, 3);
      expect(body.from_lng).toBeCloseTo(49.2043, 3);
      expect(body.to_lat).toBeCloseTo(55.7887, 3);
      expect(body.to_lng).toBeCloseTo(49.1222, 3);
    });
    // SENTINEL: на submit НЕТ вызова /geocode/search — coords пришли из dropdown.
    const geocodeCalls = mockedApiFetch.mock.calls.filter(([path]) =>
      String(path).startsWith("/geocode"),
    );
    expect(geocodeCalls).toHaveLength(0);
  });

  it("step 3: показывает ошибку при сбое /rides", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("Network error"));

    renderScreen();
    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось создать поездку");
    });
  });

  it("step 3: price_rub передаётся null при договорной", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "x" });

    renderScreen();
    goToStep3();
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

  it("submit-btn появляется только на step 3", () => {
    renderScreen();
    expect(screen.queryByTestId("submit-btn")).not.toBeInTheDocument();
    expect(screen.getByTestId("next-step-btn")).toBeInTheDocument();
    goToStep3();
    expect(screen.getByTestId("submit-btn")).toBeInTheDocument();
  });

  it("регулярная поездка: создаёт шаблон, потом поездку с template_id", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ id: "tmpl-123" }) // POST /ride-templates
      .mockResolvedValueOnce({ id: "ride-456" }); // POST /rides

    renderScreen();
    goToStep3();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    fireEvent.click(screen.getByTestId("weekday-0")); // Пн

    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      const templateCalls = mockedApiFetch.mock.calls.filter(
        ([path]) => path === "/ride-templates",
      );
      expect(templateCalls).toHaveLength(1);
      const [, init] = templateCalls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.weekdays).toContain(0);
      expect(body.departure_time).toMatch(/^\d{2}:\d{2}$/);

      const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
      expect(ridesCalls).toHaveLength(1);
      const [, ridesInit] = ridesCalls[0] ?? [];
      const ridesBody = JSON.parse((ridesInit as RequestInit).body as string);
      expect(ridesBody.template_id).toBe("tmpl-123");
    });
  });

  it("регулярная поездка: ошибка /rides → удаляет orphan-шаблон (rollback)", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({ id: "tmpl-orphan" }) // POST /ride-templates — успех
      .mockRejectedValueOnce(new Error("rides fail")) // POST /rides — ошибка
      .mockResolvedValueOnce(undefined); // DELETE /ride-templates/tmpl-orphan

    renderScreen();
    goToStep3();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    fireEvent.click(screen.getByTestId("weekday-2")); // Ср

    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось создать поездку");
    });
    // DELETE /ride-templates/tmpl-orphan должен быть вызван
    const deleteCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === "/ride-templates/tmpl-orphan",
    );
    expect(deleteCalls).toHaveLength(1);
    expect((deleteCalls[0]?.[1] as RequestInit | undefined)?.method).toBe("DELETE");
  });

  it("регулярная поездка: ошибка template → ошибка показана, /rides не вызывается", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("template fail"));

    renderScreen();
    goToStep3();
    fireEvent.click(screen.getByTestId("recurring-checkbox"));
    fireEvent.click(screen.getByTestId("weekday-1")); // Вт

    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось создать поездку");
    });
    const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
    expect(ridesCalls).toHaveLength(0);
  });

  it("обычная (не регулярная) поездка: template_id не передаётся", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "ride-789" });

    renderScreen();
    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      const ridesCalls = mockedApiFetch.mock.calls.filter(([path]) => path === "/rides");
      expect(ridesCalls).toHaveLength(1);
      const [, init] = ridesCalls[0] ?? [];
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.template_id).toBeNull();
    });
  });

  it("после submit ride инвалидирует кеш ['rides'] для последующего refetch", async () => {
    const createdRide = {
      id: "ride-optimistic-1",
      driver_id: "me-uuid",
      from_label: "ЖК Царёво",
      from_lat: 55.8945,
      from_lng: 49.2043,
      to_label: "ул. Баумана",
      to_lat: 55.7887,
      to_lng: 49.1222,
      departure_at: "2099-01-01T10:00:00Z",
      price_rub: null,
      seats_total: 3,
      seats_taken: 0,
      status: "published",
      comment: null,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce(createdRide);

    const { client } = renderScreen();
    client.setQueryData(["rides", "list", null, null, null], { rides: [], nextCursor: null });

    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      const state = client.getQueryState(["rides", "list", null, null, null]);
      expect(state?.isInvalidated).toBe(true);
    });
  });

  it("после submit ride инвалидирует кеш ['rides','mine','driver','future'] для последующего refetch", async () => {
    const createdRide = {
      id: "ride-optimistic-2",
      driver_id: "me-uuid",
      from_label: "ЖК Царёво",
      from_lat: 55.8945,
      from_lng: 49.2043,
      to_label: "ул. Баумана",
      to_lat: 55.7887,
      to_lng: 49.1222,
      departure_at: "2099-01-01T10:00:00Z",
      price_rub: null,
      seats_total: 3,
      seats_taken: 0,
      status: "published",
      comment: null,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce(createdRide);

    const { client } = renderScreen();
    client.setQueryData(["rides", "mine", "driver", "future"], { rides: [] });

    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      const state = client.getQueryState(["rides", "mine", "driver", "future"]);
      expect(state?.isInvalidated).toBe(true);
    });
  });

  it("optimistic: НЕ дёргает доп. сетевые вызовы для refetch листа", async () => {
    const createdRide = {
      id: "ride-no-refetch",
      driver_id: "me-uuid",
      from_label: "ЖК Царёво",
      from_lat: 55.8945,
      from_lng: 49.2043,
      to_label: "ул. Баумана",
      to_lat: 55.7887,
      to_lng: 49.1222,
      departure_at: "2099-01-01T10:00:00Z",
      price_rub: null,
      seats_total: 3,
      seats_taken: 0,
      status: "published",
      comment: null,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce(createdRide);

    renderScreen();
    goToStep3();
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });

    await waitFor(() => {
      const ridesPosts = mockedApiFetch.mock.calls.filter(
        ([path, init]) => path === "/rides" && (init as RequestInit | undefined)?.method === "POST",
      );
      expect(ridesPosts).toHaveLength(1);
    });
    // SENTINEL: после успешного POST /rides не должно быть GET /rides или GET /rides/mine —
    // оптимистично инжектим в кеш без доп. нагрузки на сервер.
    const ridesGets = mockedApiFetch.mock.calls.filter(
      ([path, init]) =>
        String(path).startsWith("/rides") &&
        (init as RequestInit | undefined)?.method !== "POST" &&
        (init as RequestInit | undefined)?.method !== "DELETE",
    );
    expect(ridesGets).toHaveLength(0);
  });

  it("progress bar отражает текущий шаг", () => {
    renderScreen();
    expect(screen.getByTestId("progress-1")).toBeInTheDocument();
    expect(screen.getByTestId("progress-2")).toBeInTheDocument();
    expect(screen.getByTestId("progress-3")).toBeInTheDocument();
  });

  it("prev-step-btn возвращает на предыдущий шаг", () => {
    renderScreen();
    goToStep2();
    expect(screen.getByTestId("step-indicator")).toHaveTextContent("Шаг 2/3");
    fireEvent.click(screen.getByTestId("prev-step-btn"));
    expect(screen.getByTestId("step-indicator")).toHaveTextContent("Шаг 1/3");
    expect(screen.getByTestId("input-from")).toBeInTheDocument();
  });
});
