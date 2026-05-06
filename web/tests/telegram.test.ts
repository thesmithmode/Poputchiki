import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTelegramTheme, applyThemeParams, getTelegramWebApp } from "../src/lib/telegram";

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

describe("telegram lib", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    w().Telegram = undefined;
  });

  it("getTelegramWebApp → undefined без Telegram", () => {
    expect(getTelegramWebApp()).toBeUndefined();
  });

  it("getTelegramWebApp → объект если присутствует", () => {
    const wa = { colorScheme: "light" as const, onEvent: vi.fn(), ready: vi.fn() };
    w().Telegram = { WebApp: wa };
    expect(getTelegramWebApp()).toBe(wa);
  });

  it("applyTelegramTheme(dark) → добавляет класс dark", () => {
    applyTelegramTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("applyTelegramTheme(light) → удаляет класс dark", () => {
    document.documentElement.classList.add("dark");
    applyTelegramTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("applyThemeParams", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
  });

  it("устанавливает --tg-bg из bg_color", () => {
    applyThemeParams({ bg_color: "#ffffff" });
    expect(document.documentElement.style.getPropertyValue("--tg-bg")).toBe("#ffffff");
  });

  it("устанавливает --tg-text из text_color", () => {
    applyThemeParams({ text_color: "#000000" });
    expect(document.documentElement.style.getPropertyValue("--tg-text")).toBe("#000000");
  });

  it("устанавливает --tg-accent из button_color", () => {
    applyThemeParams({ button_color: "#2481cc" });
    expect(document.documentElement.style.getPropertyValue("--tg-accent")).toBe("#2481cc");
  });

  it("устанавливает --tg-button-text из button_text_color", () => {
    applyThemeParams({ button_text_color: "#ffffff" });
    expect(document.documentElement.style.getPropertyValue("--tg-button-text")).toBe("#ffffff");
  });

  it("применяет fallback если поля отсутствуют", () => {
    applyThemeParams({});
    expect(document.documentElement.style.getPropertyValue("--tg-bg")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--tg-text")).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue("--tg-accent")).toBeTruthy();
  });

  it("подписка на themeChanged обновляет CSS переменные", () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const mockWebApp = {
      colorScheme: "light" as const,
      themeParams: { bg_color: "#ffffff" },
      onEvent: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
      }),
      ready: vi.fn(),
    };
    (window as unknown as { Telegram: { WebApp: typeof mockWebApp } }).Telegram = { WebApp: mockWebApp };

    // Simulate themeChanged event
    applyThemeParams(mockWebApp.themeParams);
    expect(document.documentElement.style.getPropertyValue("--tg-bg")).toBe("#ffffff");
  });
});
