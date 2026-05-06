import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationPreferencesScreen } from "../src/screens/NotificationPreferencesScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const DEFAULT_PREFS = {
  ride_request: true,
  ride_cancelled: true,
  confirm_participation: true,
  like_received: true,
  review_received: true,
  favorite_new_ride: true,
  support_reply: true,
  system: true,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <NotificationPreferencesScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("NotificationPreferencesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("загружает и отображает настройки", async () => {
    mockedApiFetch.mockResolvedValueOnce(DEFAULT_PREFS);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("notif-pref-screen")).toBeInTheDocument();
    });
    expect(screen.getByTestId("toggle-ride_request")).toBeInTheDocument();
    expect(screen.getByTestId("toggle-system")).toBeInTheDocument();
  });

  it("категория system всегда disabled", async () => {
    mockedApiFetch.mockResolvedValueOnce(DEFAULT_PREFS);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("toggle-system")).toBeDisabled();
    });
  });

  it("глобальный mute отключает все кроме system", async () => {
    mockedApiFetch.mockResolvedValueOnce(DEFAULT_PREFS).mockResolvedValueOnce({
      ...DEFAULT_PREFS,
      ride_request: false,
      ride_cancelled: false,
      confirm_participation: false,
      like_received: false,
      review_received: false,
      favorite_new_ride: false,
      support_reply: false,
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("toggle-global-mute")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("toggle-global-mute"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/notifications/preferences",
        expect.objectContaining({ method: "PUT" }),
      );
    });
    const putCall = mockedApiFetch.mock.calls.find(
      (c) => c[1] && (c[1] as RequestInit).method === "PUT",
    );
    const body = JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? "{}");
    expect(body.system).toBeUndefined();
    expect(body.ride_request).toBe(false);
  });

  it("переключение отдельной категории вызывает PUT", async () => {
    mockedApiFetch.mockResolvedValueOnce(DEFAULT_PREFS).mockResolvedValueOnce({
      ...DEFAULT_PREFS,
      like_received: false,
    });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("toggle-like_received")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("toggle-like_received"));
    await waitFor(() => {
      const putCall = mockedApiFetch.mock.calls.find(
        (c) => c[1] && (c[1] as RequestInit).method === "PUT",
      );
      expect(putCall).toBeDefined();
      const body = JSON.parse(((putCall?.[1] as RequestInit)?.body as string) ?? "{}");
      expect(body.like_received).toBe(false);
    });
  });

  it("показывает загрузку пока данные не получены", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText(/Загрузка/i)).toBeInTheDocument();
  });
});
