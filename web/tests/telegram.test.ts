import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTelegramTheme, getTelegramWebApp } from "../src/lib/telegram";

type WindowWithTelegram = Window & {
  Telegram?: {
    WebApp?: {
      colorScheme: "light" | "dark";
      onEvent: (...args: unknown[]) => void;
      ready: () => void;
    };
  };
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
