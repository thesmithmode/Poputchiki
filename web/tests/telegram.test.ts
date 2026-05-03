import { describe, it, expect, beforeEach, vi } from "vitest";
import { applyTelegramTheme, getTelegramWebApp } from "../src/lib/telegram";

describe("telegram lib", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    // @ts-expect-error
    delete (window as any).Telegram;
  });

  it("getTelegramWebApp → undefined без Telegram", () => {
    expect(getTelegramWebApp()).toBeUndefined();
  });

  it("getTelegramWebApp → объект если присутствует", () => {
    const wa = { colorScheme: "light", onEvent: vi.fn(), ready: vi.fn() };
    (window as any).Telegram = { WebApp: wa };
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
