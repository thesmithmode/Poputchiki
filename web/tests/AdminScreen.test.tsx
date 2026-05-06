import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminScreen } from "../src/screens/AdminScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock("../src/hooks/useMe", () => ({
  useMe: vi.fn(),
}));

import { useMe } from "../src/hooks/useMe";
import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);
const mockedUseMe = vi.mocked(useMe);

const TICKET = {
  id: "550e8400-e29b-41d4-a716-446655440060",
  user_id: "550e8400-e29b-41d4-a716-446655440001",
  text: "Помогите с входом",
  status: "open",
  reply_text: null,
  created_at: new Date().toISOString(),
};

const COMPLAINT = {
  id: "550e8400-e29b-41d4-a716-446655440061",
  reporter_id: "550e8400-e29b-41d4-a716-446655440001",
  target_id: "550e8400-e29b-41d4-a716-446655440002",
  reason: "spam",
  status: "open",
  created_at: new Date().toISOString(),
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <AdminScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("AdminScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("редиректирует не-admin пользователей (показывает forbidden)", () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "X",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "user",
      },
    });
    renderScreen();
    expect(screen.getByTestId("admin-forbidden")).toBeInTheDocument();
  });

  it("показывает загрузку для admin пока данные грузятся", () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("admin-loading")).toBeInTheDocument();
  });

  it("admin видит вкладку Тикеты", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockResolvedValueOnce([TICKET]).mockResolvedValueOnce([COMPLAINT]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("tab-tickets")).toBeInTheDocument();
    });
  });

  it("admin видит вкладку Жалобы", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockResolvedValueOnce([TICKET]).mockResolvedValueOnce([COMPLAINT]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("tab-complaints")).toBeInTheDocument();
    });
  });

  it("отображает тикет в вкладке Тикеты", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockResolvedValueOnce([TICKET]).mockResolvedValueOnce([COMPLAINT]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Помогите с входом")).toBeInTheDocument();
    });
  });

  it("форма ответа открывается по клику на тикет", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockResolvedValueOnce([TICKET]).mockResolvedValueOnce([COMPLAINT]);
    renderScreen();
    await waitFor(() => screen.getByText("Помогите с входом"));
    fireEvent.click(screen.getByTestId(`reply-btn-${TICKET.id}`));
    expect(screen.getByTestId("reply-form")).toBeInTheDocument();
  });

  it("submit reply вызывает POST /admin/support/messages/:id/reply", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch
      .mockResolvedValueOnce([TICKET])
      .mockResolvedValueOnce([COMPLAINT])
      .mockResolvedValueOnce({ ...TICKET, status: "resolved", reply_text: "ok" })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => screen.getByText("Помогите с входом"));
    fireEvent.click(screen.getByTestId(`reply-btn-${TICKET.id}`));
    fireEvent.change(screen.getByTestId("reply-text"), {
      target: { value: "Ответ администратора" },
    });
    fireEvent.click(screen.getByTestId("reply-submit"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/admin/support/messages/${TICKET.id}/reply`,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("жалоба отображается в вкладке Жалобы", async () => {
    mockedUseMe.mockReturnValue({
      status: "ok",
      user: {
        id: "u1",
        display_name: "Admin",
        onboarded: true,
        is_banned: false,
        ban_reason: null,
        banned_at: null,
        role: "admin",
      },
    });
    mockedApiFetch.mockImplementation((url: string) => {
      if (url.includes("support")) return Promise.resolve([TICKET]);
      if (url.includes("complaints")) return Promise.resolve([COMPLAINT]);
      return Promise.resolve([]);
    });
    renderScreen();
    await waitFor(() => screen.getByTestId("tab-complaints"));
    fireEvent.click(screen.getByTestId("tab-complaints"));
    await waitFor(() => {
      expect(screen.getByTestId(`complaint-${COMPLAINT.id}`)).toBeInTheDocument();
    });
  });
});
