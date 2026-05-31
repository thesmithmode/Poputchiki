import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractCompassHeading,
  getCurrentLocationFix,
  normalizeDegrees,
} from "../src/lib/geolocation";
import type { TelegramWebApp } from "../src/lib/telegram";

const telegramWebApp = vi.hoisted(() => ({ current: undefined as TelegramWebApp | undefined }));

vi.mock("../src/lib/telegram", () => ({
  getTelegramWebApp: () => telegramWebApp.current,
}));

describe("geolocation sensor helpers", () => {
  beforeEach(() => {
    telegramWebApp.current = undefined;
    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
  });

  it("normalizes headings to the 0..360 range", () => {
    expect(normalizeDegrees(360)).toBe(0);
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(725)).toBe(5);
  });

  it("uses iOS webkitCompassHeading as the real compass heading", () => {
    const heading = extractCompassHeading({
      alpha: 10,
      absolute: false,
      webkitCompassHeading: 90,
      webkitCompassAccuracy: 7,
    } as DeviceOrientationEvent & {
      webkitCompassHeading: number;
      webkitCompassAccuracy: number;
    });

    expect(heading).toEqual({
      headingDeg: 90,
      accuracyDeg: 7,
      source: "webkitCompassHeading",
    });
  });

  it("converts absolute alpha to clockwise compass heading", () => {
    expect(extractCompassHeading({ alpha: 270, absolute: true } as DeviceOrientationEvent)).toEqual(
      {
        headingDeg: 90,
        accuracyDeg: null,
        source: "absoluteAlpha",
      },
    );
  });

  it("rejects non-absolute alpha so the UI does not show a fake compass", () => {
    expect(extractCompassHeading({ alpha: 270, absolute: false } as DeviceOrientationEvent)).toBe(
      null,
    );
  });

  it("preserves Telegram coordinates and horizontal accuracy", async () => {
    const locationManager = {
      isInited: true,
      isLocationAvailable: true,
      isAccessRequested: true,
      isAccessGranted: true,
      init: vi.fn(),
      openSettings: vi.fn(),
      getLocation: vi.fn((callback) => {
        callback({
          latitude: 55.801,
          longitude: 49.123,
          altitude: null,
          course: 180,
          speed: 1.2,
          horizontal_accuracy: 37,
          vertical_accuracy: null,
          course_accuracy: 12,
          speed_accuracy: null,
        });
        return locationManager;
      }),
    };
    telegramWebApp.current = {
      colorScheme: "light",
      LocationManager: locationManager,
      onEvent: vi.fn(),
      ready: vi.fn(),
    };

    await expect(getCurrentLocationFix()).resolves.toEqual({
      lat: 55.801,
      lng: 49.123,
      accuracyM: 37,
      source: "telegram",
    });
  });

  it("preserves browser coordinates and accuracy", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({
            coords: {
              latitude: 55.802,
              longitude: 49.124,
              accuracy: 24,
            },
          }),
        ),
      },
      configurable: true,
    });

    await expect(getCurrentLocationFix()).resolves.toEqual({
      lat: 55.802,
      lng: 49.124,
      accuracyM: 24,
      source: "browser",
    });
  });
});
