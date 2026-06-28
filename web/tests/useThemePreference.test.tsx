import "@testing-library/jest-dom/vitest";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useThemePreference } from "../src/hooks/useThemePreference";

const originalMatchMedia = window.matchMedia;

describe("useThemePreference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    localStorage.clear();
    document.documentElement.className = "";
    vi.restoreAllMocks();
  });

  it("не падает при system theme без browser matchMedia", () => {
    localStorage.setItem("pp_theme", "system");
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(() => renderHook(() => useThemePreference())).not.toThrow();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("подписывается на legacy MediaQueryList через addListener", () => {
    localStorage.setItem("pp_theme", "system");
    const addListener = vi.fn();
    const removeListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addListener,
        removeListener,
      })),
    });

    const { unmount } = renderHook(() => useThemePreference());

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(removeListener).not.toHaveBeenCalled();
    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  it("сохраняет современную подписку на MediaQueryList change", () => {
    localStorage.setItem("pp_theme", "system");
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener,
        removeEventListener,
      })),
    });

    const { unmount } = renderHook(() => useThemePreference());

    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("применяет системную тему после legacy listener callback", () => {
    localStorage.setItem("pp_theme", "system");
    let dark = false;
    let listener: (() => void) | undefined;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => ({
        get matches() {
          return dark;
        },
        addListener: vi.fn((handler: () => void) => {
          listener = handler;
        }),
        removeListener: vi.fn(),
      })),
    });

    renderHook(() => useThemePreference());
    expect(document.documentElement).not.toHaveClass("dark");

    dark = true;
    act(() => listener?.());

    expect(document.documentElement).toHaveClass("dark");
  });
});
