import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiFetch = vi.fn();
vi.mock("../src/lib/api", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(s: number, b: unknown) {
      super("err");
      this.status = s;
      this.body = b;
    }
  },
}));

vi.mock("../src/hooks/useTelegramBack", () => ({ useTelegramBack: vi.fn() }));
vi.mock("../src/hooks/useMe", () => ({
  useMe: () => ({
    status: "ok",
    user: {
      id: "u1",
      display_name: "Test",
      onboarded: true,
      is_banned: false,
      ban_reason: null,
      banned_at: null,
      role: "user",
    },
  }),
}));
vi.mock("../src/hooks/useUser", () => ({
  useUser: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("../src/hooks/useThemePreference", () => ({
  useThemePreference: () => ({ pref: "system", setPref: vi.fn() }),
}));

import { SettingsScreen } from "../src/screens/SettingsScreen";

const mockReload = vi.fn();

Object.defineProperty(window, "location", {
  value: { ...window.location, reload: mockReload },
  writable: true,
});

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/settings"]}>
        <SettingsScreen />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockNavigate.mockReset();
    mockReload.mockReset();
  });

  it("рендерит все основные элементы", () => {
    renderSettings();
    expect(screen.getByText("Настройки")).toBeInTheDocument();
    expect(screen.getByText(/Уведомления/)).toBeInTheDocument();
    expect(screen.getByText(/Политика конфиденциальности/)).toBeInTheDocument();
    expect(screen.getByText(/Условия использования/)).toBeInTheDocument();
    expect(screen.getByTestId("logout-btn")).toBeInTheDocument();
    expect(screen.getByTestId("delete-account-btn")).toBeInTheDocument();
    expect(screen.getByTestId("app-version")).toBeInTheDocument();
  });

  it("logout вызывает POST /auth/logout и reload", async () => {
    mockApiFetch.mockResolvedValue({});
    renderSettings();
    fireEvent.click(screen.getByTestId("logout-btn"));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/auth/logout",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(mockReload).toHaveBeenCalled();
  });

  it("logout работает даже при ошибке API", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    renderSettings();
    fireEvent.click(screen.getByTestId("logout-btn"));
    await waitFor(() => expect(mockReload).toHaveBeenCalled());
  });

  it("кнопка delete открывает модалку подтверждения", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("delete-account-btn"));
    expect(screen.getByTestId("delete-confirm-modal")).toBeInTheDocument();
  });

  it("submit удаления заблокирован пока не введено 'УДАЛИТЬ'", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("delete-account-btn"));
    const submitBtn = screen.getByTestId("delete-confirm-submit");
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "удалить" },
    });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "УДАЛИТЬ" },
    });
    expect(submitBtn).not.toBeDisabled();
  });

  it("подтверждение удаления вызывает DELETE /users/me + reload", async () => {
    mockApiFetch.mockResolvedValue({});
    renderSettings();
    fireEvent.click(screen.getByTestId("delete-account-btn"));
    fireEvent.change(screen.getByTestId("delete-confirm-input"), {
      target: { value: "УДАЛИТЬ" },
    });
    fireEvent.click(screen.getByTestId("delete-confirm-submit"));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith("/users/me", { method: "DELETE" }),
    );
    expect(mockReload).toHaveBeenCalled();
  });

  it("отмена удаления закрывает модалку", () => {
    renderSettings();
    fireEvent.click(screen.getByTestId("delete-account-btn"));
    expect(screen.getByTestId("delete-confirm-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Отмена"));
    expect(screen.queryByTestId("delete-confirm-modal")).not.toBeInTheDocument();
  });

  it("навигация к уведомлениям", () => {
    renderSettings();
    fireEvent.click(screen.getByText(/Уведомления/));
    expect(mockNavigate).toHaveBeenCalledWith("/settings/notifications");
  });

  it("навигация к privacy", () => {
    renderSettings();
    fireEvent.click(screen.getByText(/Политика конфиденциальности/));
    expect(mockNavigate).toHaveBeenCalledWith("/privacy");
  });

  it("навигация к terms", () => {
    renderSettings();
    fireEvent.click(screen.getByText(/Условия использования/));
    expect(mockNavigate).toHaveBeenCalledWith("/terms");
  });
});
