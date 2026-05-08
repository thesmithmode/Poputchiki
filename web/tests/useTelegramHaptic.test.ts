import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTelegramHaptic } from "../src/hooks/useTelegramHaptic";

type W = Window & { Telegram?: { WebApp?: unknown } };

const mockHaptic = {
  impactOccurred: vi.fn(),
  notificationOccurred: vi.fn(),
  selectionChanged: vi.fn(),
};

const mockWebApp = {
  colorScheme: "light" as const,
  themeParams: {},
  HapticFeedback: mockHaptic,
  onEvent: vi.fn(),
  ready: vi.fn(),
};

beforeEach(() => {
  (window as W).Telegram = { WebApp: mockWebApp };
  vi.clearAllMocks();
});

afterEach(() => {
  (window as W).Telegram = undefined as unknown as { WebApp?: unknown };
});

describe("useTelegramHaptic", () => {
  it("возвращает функции impact, notification, selection", () => {
    const { result } = renderHook(() => useTelegramHaptic());
    expect(typeof result.current.impact).toBe("function");
    expect(typeof result.current.notification).toBe("function");
    expect(typeof result.current.selection).toBe("function");
  });

  it("impact вызывает HapticFeedback.impactOccurred", () => {
    const { result } = renderHook(() => useTelegramHaptic());
    result.current.impact("medium");
    expect(mockHaptic.impactOccurred).toHaveBeenCalledWith("medium");
  });

  it("notification вызывает HapticFeedback.notificationOccurred", () => {
    const { result } = renderHook(() => useTelegramHaptic());
    result.current.notification("success");
    expect(mockHaptic.notificationOccurred).toHaveBeenCalledWith("success");
  });

  it("selection вызывает HapticFeedback.selectionChanged", () => {
    const { result } = renderHook(() => useTelegramHaptic());
    result.current.selection();
    expect(mockHaptic.selectionChanged).toHaveBeenCalledOnce();
  });

  it("не бросает ошибку если HapticFeedback недоступен", () => {
    (window as W).Telegram = undefined as unknown as { WebApp?: unknown };
    const { result } = renderHook(() => useTelegramHaptic());
    expect(() => result.current.impact("light")).not.toThrow();
    expect(() => result.current.notification("error")).not.toThrow();
    expect(() => result.current.selection()).not.toThrow();
  });
});
