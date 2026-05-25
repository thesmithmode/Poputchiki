import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/api", () => ({
  apiFetch: vi.fn().mockRejectedValue(new Error("network")),
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown) {
      super("ApiError");
      this.status = status;
      this.body = body;
    }
  },
}));

const MOCK_ME_STATE = {
  status: "ok" as const,
  user: {
    id: "test-user-id",
    display_name: "Test User",
    onboarded: true,
    is_banned: false,
    ban_reason: null,
    banned_at: null,
    role: "user" as const,
  },
};

vi.mock("../src/hooks/useMe", () => ({
  useMe: () => MOCK_ME_STATE,
  useBootMe: () => MOCK_ME_STATE,
}));

vi.mock("../src/hooks/useRides", () => ({
  useRides: () => ({ isPending: false, isError: false, data: { rides: [] }, isFetching: false }),
}));

import { App } from "../src/App";

describe("NotFoundPage", () => {
  beforeEach(() => {
    window.location.hash = "#/this-does-not-exist-xyz";
  });
  afterEach(() => {
    window.location.hash = "";
  });

  it("показывает страницу 404 для несуществующего маршрута", async () => {
    render(<App />);
    await screen.findByTestId("not-found", {}, { timeout: 3000 });
    expect(screen.getByText("Страница не найдена")).toBeInTheDocument();
  });

  it("кнопка 'На главную' присутствует", async () => {
    render(<App />);
    await screen.findByTestId("not-found", {}, { timeout: 3000 });
    expect(screen.getByRole("button", { name: "На главную" })).toBeInTheDocument();
  });
});
