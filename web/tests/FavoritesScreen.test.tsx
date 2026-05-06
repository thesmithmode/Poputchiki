import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritesScreen } from "../src/screens/FavoritesScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const TARGET_ID = "550e8400-e29b-41d4-a716-446655440020";

const MOCK_FAV = {
  target_id: TARGET_ID,
  notify: true,
  created_at: new Date().toISOString(),
  display_name: "Иван Иванов",
  tg_username: "ivan",
  avatar_url: null,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <FavoritesScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("FavoritesScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("показывает загрузку", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("favorites-loading")).toBeInTheDocument();
  });

  it("показывает 'Нет избранных' при пустом списке", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("favorites-empty")).toBeInTheDocument();
    });
  });

  it("отображает имя избранного пользователя", async () => {
    mockedApiFetch.mockResolvedValueOnce([MOCK_FAV]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Иван Иванов")).toBeInTheDocument();
    });
  });

  it("показывает @username если есть", async () => {
    mockedApiFetch.mockResolvedValueOnce([MOCK_FAV]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("@ivan")).toBeInTheDocument();
    });
  });

  it("кнопка notify показывает 🔔 когда notify=true", async () => {
    mockedApiFetch.mockResolvedValueOnce([MOCK_FAV]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId(`notify-${TARGET_ID}`)).toHaveTextContent("🔔");
    });
  });

  it("кнопка notify показывает 🔕 когда notify=false", async () => {
    mockedApiFetch.mockResolvedValueOnce([{ ...MOCK_FAV, notify: false }]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId(`notify-${TARGET_ID}`)).toHaveTextContent("🔕");
    });
  });

  it("клик по notify вызывает PATCH /favorites/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce([MOCK_FAV]).mockResolvedValueOnce({});
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId(`notify-${TARGET_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`notify-${TARGET_ID}`));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/favorites/${TARGET_ID}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("клик по remove вызывает DELETE /favorites/:id", async () => {
    mockedApiFetch.mockResolvedValueOnce([MOCK_FAV]).mockResolvedValueOnce(undefined);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId(`remove-${TARGET_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`remove-${TARGET_ID}`));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        `/favorites/${TARGET_ID}`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
