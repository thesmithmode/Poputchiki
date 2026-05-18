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
