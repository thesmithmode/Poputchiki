import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BannedScreen } from "../src/components/BannedScreen";

vi.mock("../src/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/api")>();
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from "../src/lib/api";
const mockedApiFetch = vi.mocked(apiFetch);

describe("BannedScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("отправляет обращение в поддержку с backend-compatible полем text", async () => {
    mockedApiFetch.mockResolvedValueOnce({ id: "ticket-id", status: "open" });

    render(<BannedScreen reason="spam" bannedAt="2026-06-28T00:00:00.000Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Связаться с поддержкой" }));

    await waitFor(() => {
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/support/messages",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ text: "Прошу пересмотреть блокировку аккаунта" }),
        }),
      );
    });
    expect(screen.getByRole("button", { name: "Обращение отправлено" })).toBeDisabled();
  });

  it("не показывает успешную отправку, если API вернул ошибку", async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error("invalid input"));

    render(<BannedScreen reason={null} bannedAt={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Связаться с поддержкой" }));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Связаться с поддержкой" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Обращение отправлено" })).not.toBeInTheDocument();
  });
});
