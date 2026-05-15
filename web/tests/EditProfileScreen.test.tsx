import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditProfileScreen } from "../src/screens/EditProfileScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";

const mockedApiFetch = vi.mocked(apiFetch);

const ME_BASIC = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  display_name: "Алексей",
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <EditProfileScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("EditProfileScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("рендерится с заголовком и состоянием loading", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByText("Редактирование профиля")).toBeInTheDocument();
    expect(screen.getByText("Загрузка...")).toBeInTheDocument();
  });

  it("после загрузки заполняет display_name", async () => {
    mockedApiFetch.mockResolvedValue(ME_BASIC);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-display-name")).toHaveValue("Алексей");
    });
  });

  it("phone и apt поля пустые при загрузке (PII не возвращается)", async () => {
    mockedApiFetch.mockResolvedValue(ME_BASIC);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-phone")).toHaveValue("");
      expect(screen.getByTestId("input-apt")).toHaveValue("");
    });
  });

  it("при ошибке загрузки показывает form-error", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("net"));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось загрузить профиль");
    });
  });

  it("submit без имени → form-error", async () => {
    mockedApiFetch.mockResolvedValueOnce({ ...ME_BASIC, display_name: "" });
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-display-name")).toHaveValue("");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Имя не может быть пустым");
    });
  });

  it("успешный submit вызывает PATCH /users/me и показывает success", async () => {
    mockedApiFetch.mockResolvedValueOnce(ME_BASIC).mockResolvedValueOnce({});
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-display-name")).toHaveValue("Алексей");
    });
    fireEvent.change(screen.getByTestId("input-phone"), {
      target: { value: "+79991234567" },
    });
    fireEvent.change(screen.getByTestId("input-apt"), { target: { value: "Дом 5, кв. 7" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const patchCalls = mockedApiFetch.mock.calls.filter(
        ([path, init]) => path === "/users/me" && (init as RequestInit)?.method === "PATCH",
      );
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0]?.[1] as RequestInit).body as string);
      expect(body.display_name).toBe("Алексей");
      expect(body.phone).toBe("+79991234567");
      expect(body.apt_number).toBe("Дом 5, кв. 7");
    });
    expect(screen.getByTestId("form-success")).toHaveTextContent("Сохранено");
  });

  it("пустые phone/apt в PATCH не отправляются", async () => {
    mockedApiFetch.mockResolvedValueOnce(ME_BASIC).mockResolvedValueOnce({});
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-display-name")).toHaveValue("Алексей");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      const patchCalls = mockedApiFetch.mock.calls.filter(
        ([path, init]) => path === "/users/me" && (init as RequestInit)?.method === "PATCH",
      );
      expect(patchCalls).toHaveLength(1);
      const body = JSON.parse((patchCalls[0]?.[1] as RequestInit).body as string);
      expect(body.phone).toBeUndefined();
      expect(body.apt_number).toBeUndefined();
    });
  });

  it("ошибка PATCH показывает form-error", async () => {
    mockedApiFetch.mockResolvedValueOnce(ME_BASIC).mockRejectedValueOnce(new Error("Network"));
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("input-display-name")).toHaveValue("Алексей");
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("submit-btn"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("form-error")).toHaveTextContent("Не удалось сохранить");
    });
  });

  it("back-btn существует", async () => {
    mockedApiFetch.mockResolvedValue(ME_BASIC);
    renderScreen();
    expect(screen.getByTestId("back-btn")).toBeInTheDocument();
  });
});
