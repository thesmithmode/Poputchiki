import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmParticipationScreen } from "../src/screens/ConfirmParticipationScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const RIDE_ID = "550e8400-e29b-41d4-a716-446655440050";

function renderScreen(rideId = RIDE_ID) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[`/rides/${rideId}/confirm`]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/rides/:id/confirm" element={<ConfirmParticipationScreen />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("ConfirmParticipationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерит экран подтверждения", () => {
    renderScreen();
    expect(screen.getByTestId("confirm-screen")).toBeInTheDocument();
  });

  it("показывает кнопку 'Подтвердить участие'", () => {
    renderScreen();
    expect(screen.getByTestId("confirm-btn")).toBeInTheDocument();
  });

  it("клик по кнопке вызывает POST /api/rides/:id/confirm-participation", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/rides/${RIDE_ID}/confirm-participation`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("после успеха показывает модалку благодарности", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("thank-you-modal")).toBeInTheDocument();
    });
  });

  it("модалка содержит кнопку 'Оставить отзыв'", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("leave-review-btn")).toBeInTheDocument();
    });
  });

  it("модалка содержит кнопку 'Позже'", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("skip-review-btn")).toBeInTheDocument();
    });
  });

  it("кнопка задизейблена во время запроса (loading state)", async () => {
    let resolve: (v: unknown) => void;
    mockedApiFetch.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    expect(screen.getByTestId("confirm-btn")).toBeDisabled();
    resolve!({ ok: true });
    await waitFor(() => screen.getByTestId("thank-you-modal"));
  });

  it("при ошибке 409 (уже подтверждено) показывает сообщение", async () => {
    const { ApiError } = await import("../src/lib/api");
    mockedApiFetch.mockRejectedValueOnce(new ApiError(409, "already_confirmed"));
    renderScreen();
    fireEvent.click(screen.getByTestId("confirm-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("already-confirmed-msg")).toBeInTheDocument();
    });
  });
});
