import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupportScreen } from "../src/screens/SupportScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

const TICKET_OPEN = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  text: "Не работает поиск",
  status: "open",
  reply_text: null,
  replied_at: null,
  created_at: new Date().toISOString(),
};
const TICKET_RESOLVED = {
  id: "550e8400-e29b-41d4-a716-446655440031",
  text: "Проблема с оплатой",
  status: "resolved",
  reply_text: "Проблема решена",
  replied_at: new Date().toISOString(),
  created_at: new Date(Date.now() - 86400000).toISOString(),
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <SupportScreen />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("SupportScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("показывает загрузку", () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(screen.getByTestId("support-loading")).toBeInTheDocument();
  });

  it("показывает 'Нет обращений' при пустом списке", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId("support-empty")).toBeInTheDocument();
    });
  });

  it("отображает открытый тикет", async () => {
    mockedApiFetch.mockResolvedValueOnce([TICKET_OPEN]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Не работает поиск")).toBeInTheDocument();
    });
  });

  it("отображает статус тикета", async () => {
    mockedApiFetch.mockResolvedValueOnce([TICKET_OPEN, TICKET_RESOLVED]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByTestId(`ticket-status-${TICKET_OPEN.id}`)).toHaveTextContent("open");
      expect(screen.getByTestId(`ticket-status-${TICKET_RESOLVED.id}`)).toHaveTextContent(
        "resolved",
      );
    });
  });

  it("показывает reply_text у resolved тикета", async () => {
    mockedApiFetch.mockResolvedValueOnce([TICKET_RESOLVED]);
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText("Проблема решена")).toBeInTheDocument();
    });
  });

  it("кнопка 'Написать в поддержку' открывает форму", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => screen.getByTestId("support-empty"));
    fireEvent.click(screen.getByTestId("new-ticket-btn"));
    expect(screen.getByTestId("new-ticket-form")).toBeInTheDocument();
  });

  it("textarea в форме ограничена 2000 символами", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => screen.getByTestId("support-empty"));
    fireEvent.click(screen.getByTestId("new-ticket-btn"));
    const ta = screen.getByTestId("ticket-text") as HTMLTextAreaElement;
    expect(ta.maxLength).toBe(2000);
  });

  it("submit вызывает POST /api/support/messages", async () => {
    mockedApiFetch
      .mockResolvedValueOnce([]) // initial list
      .mockResolvedValueOnce({ id: "new-id", status: "open" }) // POST
      .mockResolvedValueOnce([]); // refetch
    renderScreen();
    await waitFor(() => screen.getByTestId("support-empty"));
    fireEvent.click(screen.getByTestId("new-ticket-btn"));
    fireEvent.change(screen.getByTestId("ticket-text"), {
      target: { value: "Нужна помощь с регистрацией" },
    });
    fireEvent.click(screen.getByTestId("ticket-submit"));
    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/support/messages",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Нужна помощь"),
        }),
      );
    });
  });

  it("кнопка submit задизейблена при пустом тексте", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderScreen();
    await waitFor(() => screen.getByTestId("support-empty"));
    fireEvent.click(screen.getByTestId("new-ticket-btn"));
    expect(screen.getByTestId("ticket-submit")).toBeDisabled();
  });
});
