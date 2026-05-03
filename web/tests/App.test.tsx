import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { App } from "../src/App";

describe("App", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    // @ts-expect-error
    delete (window as any).Telegram;
  });

  it("рендерит главный маршрут без ошибок", () => {
    render(<App />);
    expect(screen.getByTestId("app-root")).toBeInTheDocument();
  });

  it("использует HashRouter (URL hash-based)", () => {
    render(<App />);
    // HashRouter работает с window.location.hash; smoke: стартовый путь = /
    expect(window.location.hash === "" || window.location.hash.startsWith("#/")).toBe(true);
  });

  it("подхватывает Telegram colorScheme=dark → класс dark на html", () => {
    (window as any).Telegram = {
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
    (window as any).Telegram = {
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
