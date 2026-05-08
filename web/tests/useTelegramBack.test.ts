import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTelegramBack } from "../src/hooks/useTelegramBack";

type W = Window & { Telegram?: { WebApp?: unknown } };

const mockBackButton = {
  show: vi.fn(),
  hide: vi.fn(),
  onClick: vi.fn(),
  offClick: vi.fn(),
};

const mockWebApp = {
  colorScheme: "light" as const,
  themeParams: {},
  BackButton: mockBackButton,
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

describe("useTelegramBack", () => {
  it("вызывает BackButton.show при монтировании", () => {
    renderHook(() => useTelegramBack(() => {}));
    expect(mockBackButton.show).toHaveBeenCalledOnce();
  });

  it("вызывает BackButton.hide при размонтировании", () => {
    const { unmount } = renderHook(() => useTelegramBack(() => {}));
    unmount();
    expect(mockBackButton.hide).toHaveBeenCalledOnce();
  });

  it("регистрирует callback onClick", () => {
    const onBack = vi.fn();
    renderHook(() => useTelegramBack(onBack));
    expect(mockBackButton.onClick).toHaveBeenCalledWith(onBack);
  });

  it("снимает callback offClick при размонтировании", () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useTelegramBack(onBack));
    unmount();
    expect(mockBackButton.offClick).toHaveBeenCalledWith(onBack);
  });

  it("ничего не делает если BackButton недоступен", () => {
    (window as W).Telegram = undefined as unknown as { WebApp?: unknown };
    expect(() => renderHook(() => useTelegramBack(() => {}))).not.toThrow();
  });
});
