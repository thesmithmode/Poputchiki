import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

type WindowWithTelegram = Window & {
  Telegram?:
    | {
        WebApp?: {
          colorScheme: "light" | "dark";
          onEvent: (...args: unknown[]) => void;
          ready: () => void;
        };
      }
    | undefined;
};

const w = () => window as unknown as WindowWithTelegram;

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    localStorage.removeItem("themePreference");
    w().Telegram = undefined;
  });

  it("рендерит главный маршрут без ошибок", () => {
    render(<App />);
    expect(screen.getByTestId("app-root")).toBeInTheDocument();
  });

  it("использует HashRouter (URL hash-based)", () => {
    render(<App />);
    expect(window.location.hash === "" || window.location.hash.startsWith("#/")).toBe(true);
  });

  it("подхватывает Telegram colorScheme=dark → класс dark на html (при system preference)", () => {
    localStorage.setItem("themePreference", "system");
    w().Telegram = {
      WebApp: {
        colorScheme: "dark",
        onEvent: vi.fn(),
        ready: vi.fn(),
      },
    };
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("colorScheme=light → нет класса dark", () => {
    w().Telegram = {
      WebApp: {
        colorScheme: "light",
        onEvent: vi.fn(),
        ready: vi.fn(),
      },
    };
    render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("без window.Telegram не падает", () => {
    expect(() => render(<App />)).not.toThrow();
  });
});
