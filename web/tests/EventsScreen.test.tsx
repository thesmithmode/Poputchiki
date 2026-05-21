import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventsScreen } from "../src/screens/EventsScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const RIDE_ID = "aaaaaaaa-0000-4000-a000-000000000001";
const NOTIF_ID = "11111111-1111-4111-a111-111111111111";

const UNREAD_NOTIFICATION = {
  id: NOTIF_ID,
  category: "ride_request",
  ride_id: RIDE_ID,
  data: { passenger_name: "Антон" },
  is_read: false,
  created_at: new Date().toISOString(),
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <EventsScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("EventsScreen — mark-on-click", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("клик по непрочитанному уведомлению вызывает POST /notifications/:id/read", async () => {
    mockedApiFetch.mockResolvedValueOnce({ notifications: [UNREAD_NOTIFICATION] });
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    renderScreen();

    const button = await screen.findByTestId(`notification-${NOTIF_ID}`);
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/notifications/${NOTIF_ID}/read`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("клик навигирует на ride_id если он есть", async () => {
    mockedApiFetch.mockResolvedValueOnce({ notifications: [UNREAD_NOTIFICATION] });
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    renderScreen();

    const button = await screen.findByTestId(`notification-${NOTIF_ID}`);
    fireEvent.click(button);

    expect(mockNavigate).toHaveBeenCalledWith(`/rides/${RIDE_ID}`);
  });

  it("уже прочитанное уведомление НЕ вызывает POST /read", async () => {
    const readNotif = { ...UNREAD_NOTIFICATION, is_read: true };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [readNotif] });

    renderScreen();

    const button = await screen.findByTestId(`notification-${NOTIF_ID}`);
    fireEvent.click(button);

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/read$/),
      expect.any(Object),
    );
  });

  it("уведомление без ride_id всё равно маркируется как прочитанное", async () => {
    const noRideNotif = { ...UNREAD_NOTIFICATION, ride_id: null };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [noRideNotif] });
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    renderScreen();

    const button = await screen.findByTestId(`notification-${NOTIF_ID}`);
    fireEvent.click(button);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/notifications/${NOTIF_ID}/read`,
        expect.objectContaining({ method: "POST" }),
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("показывает счётчик непрочитанных в шапке", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      notifications: [
        UNREAD_NOTIFICATION,
        { ...UNREAD_NOTIFICATION, id: "22222222-2222-4222-a222-222222222222" },
      ],
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });
});

describe("EventsScreen — inline accept/reject (ride_request)", () => {
  const REQUEST_ID = "33333333-3333-4333-a333-333333333333";
  const RIDE_REQUEST_NOTIF = {
    ...UNREAD_NOTIFICATION,
    data: { passenger_name: "Антон", request_id: REQUEST_ID },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рисует кнопки Принять/Отклонить для ride_request с request_id", async () => {
    mockedApiFetch.mockResolvedValueOnce({ notifications: [RIDE_REQUEST_NOTIF] });

    renderScreen();

    expect(await screen.findByTestId(`notification-${NOTIF_ID}-accept`)).toBeInTheDocument();
    expect(screen.getByTestId(`notification-${NOTIF_ID}-reject`)).toBeInTheDocument();
  });

  it("клик Принять → POST /ride-requests/:id/accept + invalidate", async () => {
    // Initial GET, accept POST, mark-read POST, refetch after invalidate (still
    // returns the same notification but now is_read=true via cache update).
    mockedApiFetch.mockResolvedValueOnce({ notifications: [RIDE_REQUEST_NOTIF] });
    mockedApiFetch.mockResolvedValueOnce({ id: REQUEST_ID, status: "accepted" });
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    mockedApiFetch.mockResolvedValue({
      notifications: [{ ...RIDE_REQUEST_NOTIF, is_read: true }],
    });

    renderScreen();

    const acceptBtn = await screen.findByTestId(`notification-${NOTIF_ID}-accept`);
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/ride-requests/${REQUEST_ID}/accept`,
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Ответ отправлен")).toBeInTheDocument();
    });
  });

  it("клик Отклонить → POST /ride-requests/:id/reject", async () => {
    mockedApiFetch.mockResolvedValueOnce({ notifications: [RIDE_REQUEST_NOTIF] });
    mockedApiFetch.mockResolvedValueOnce({ id: REQUEST_ID, status: "rejected" });
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    mockedApiFetch.mockResolvedValue({
      notifications: [{ ...RIDE_REQUEST_NOTIF, is_read: true }],
    });

    renderScreen();

    const rejectBtn = await screen.findByTestId(`notification-${NOTIF_ID}-reject`);
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/ride-requests/${REQUEST_ID}/reject`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("без request_id в data — кнопки не рисуются", async () => {
    const notifWithoutReqId = {
      ...UNREAD_NOTIFICATION,
      data: { passenger_name: "Антон" }, // no request_id
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notifWithoutReqId] });

    renderScreen();

    await screen.findByTestId(`notification-${NOTIF_ID}`);
    expect(screen.queryByTestId(`notification-${NOTIF_ID}-accept`)).toBeNull();
    expect(screen.queryByTestId(`notification-${NOTIF_ID}-reject`)).toBeNull();
  });

  it("кнопки рисуются только для category=ride_request", async () => {
    const likeNotif = {
      ...UNREAD_NOTIFICATION,
      category: "like_received",
      data: { request_id: REQUEST_ID }, // даже с request_id — не должно показывать
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [likeNotif] });

    renderScreen();

    await screen.findByTestId(`notification-${NOTIF_ID}`);
    expect(screen.queryByTestId(`notification-${NOTIF_ID}-accept`)).toBeNull();
  });

  it("ошибка API → показывает сообщение об ошибке", async () => {
    mockedApiFetch.mockResolvedValueOnce({ notifications: [RIDE_REQUEST_NOTIF] });
    mockedApiFetch.mockRejectedValueOnce(new Error("boom"));

    renderScreen();

    const acceptBtn = await screen.findByTestId(`notification-${NOTIF_ID}-accept`);
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/Ошибка/i)).toBeInTheDocument();
    });
  });
});

describe("EventsScreen — i18n действий и actor name", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ride_request_cancelled: показывает локализованный текст, не raw category", async () => {
    const notif = {
      id: NOTIF_ID,
      category: "ride_request_cancelled",
      ride_id: RIDE_ID,
      data: { passenger_name: "Иван", request_id: "req-xx" },
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notif] });

    renderScreen();

    const row = await screen.findByTestId(`notification-${NOTIF_ID}-row`);
    expect(row).not.toHaveTextContent("ride_request_cancelled");
    expect(row).toHaveTextContent(/отмен/i);
  });

  it("ride_completed: показывает локализованный текст, не raw category", async () => {
    const notif = {
      id: NOTIF_ID,
      category: "ride_completed",
      ride_id: RIDE_ID,
      data: { driver_name: "Иван" },
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notif] });

    renderScreen();

    const row = await screen.findByTestId(`notification-${NOTIF_ID}-row`);
    expect(row).not.toHaveTextContent("ride_completed");
  });

  it("favorite_new_ride: показывает локализованный текст", async () => {
    const notif = {
      id: NOTIF_ID,
      category: "favorite_new_ride",
      ride_id: RIDE_ID,
      data: { driver_id: "x" },
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notif] });

    renderScreen();

    const row = await screen.findByTestId(`notification-${NOTIF_ID}-row`);
    expect(row).not.toHaveTextContent("favorite_new_ride");
  });

  it("если в data нет имени актора — fallback НЕ показывает 'Попутчики Царёво'", async () => {
    const notif = {
      id: NOTIF_ID,
      category: "ride_request_rejected",
      ride_id: RIDE_ID,
      data: {},
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notif] });

    renderScreen();

    const row = await screen.findByTestId(`notification-${NOTIF_ID}-row`);
    expect(row).not.toHaveTextContent(/Попутчики\s+Царёво/i);
  });

  it("если actor_name=пустая строка — fallback НЕ показывает 'Попутчики Царёво'", async () => {
    const notif = {
      id: NOTIF_ID,
      category: "ride_request",
      ride_id: RIDE_ID,
      data: { passenger_name: "", request_id: "req-yy" },
      is_read: false,
      created_at: new Date().toISOString(),
    };
    mockedApiFetch.mockResolvedValueOnce({ notifications: [notif] });

    renderScreen();

    const row = await screen.findByTestId(`notification-${NOTIF_ID}-row`);
    expect(row).not.toHaveTextContent(/Попутчики\s+Царёво/i);
  });
});
