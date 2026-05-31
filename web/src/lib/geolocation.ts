import { getTelegramWebApp } from "./telegram";
import type { TelegramLocationData } from "./telegram";

export interface LocationFix {
  lat: number;
  lng: number;
  accuracyM: number | null;
  source: "telegram" | "browser";
}

export interface CompassHeading {
  headingDeg: number;
  accuracyDeg: number | null;
  source: "webkitCompassHeading" | "absoluteAlpha";
}

export type DeviceClass = "mobileOrTablet" | "desktop" | "unknown";

export interface CompassCapability {
  eligible: boolean;
  reason?: "desktop" | "unsupported" | "no-real-heading";
}

export interface DeviceCapabilityInput {
  platform?: string | null;
  maxTouchPoints?: number;
  hasTouchEvent?: boolean;
  hasDeviceOrientation?: boolean;
  userAgent?: string;
}

type WebKitDeviceOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number | null;
  webkitCompassAccuracy?: number | null;
};

const DESKTOP_TELEGRAM_PLATFORMS = new Set([
  "tdesktop",
  "web",
  "weba",
  "webk",
  "windows",
  "macos",
  "linux",
]);

const MOBILE_OR_TABLET_TELEGRAM_PLATFORMS = new Set([
  "android",
  "android_x",
  "ios",
  "ipad",
  "iphone",
]);

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function mapBearingFromHeading(headingDeg: number): number {
  return -normalizeDegrees(headingDeg);
}

export function arrowRotationFromHeading(headingDeg: number): number {
  return normalizeDegrees(headingDeg);
}

export function uprightRotationFromHeading(headingDeg: number): number {
  return normalizeDegrees(headingDeg);
}

export function calculateMapOverscanSize(
  viewportWidth: number,
  viewportHeight: number,
  safetyPadding = 96,
): number {
  const width = Math.max(0, viewportWidth);
  const height = Math.max(0, viewportHeight);
  return Math.ceil(Math.hypot(width, height)) + safetyPadding;
}

function getCurrentPlatform(input?: DeviceCapabilityInput): string | null {
  const value = input?.platform ?? getTelegramWebApp()?.platform ?? null;
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function getCurrentMaxTouchPoints(input?: DeviceCapabilityInput): number {
  if (typeof input?.maxTouchPoints === "number") return input.maxTouchPoints;
  if (typeof navigator !== "undefined" && typeof navigator.maxTouchPoints === "number") {
    return navigator.maxTouchPoints;
  }
  return 0;
}

function getCurrentHasTouch(input?: DeviceCapabilityInput): boolean {
  if (typeof input?.hasTouchEvent === "boolean") return input.hasTouchEvent;
  if (getCurrentMaxTouchPoints(input) > 0) return true;
  return typeof window !== "undefined" && "ontouchstart" in window;
}

function getCurrentUserAgent(input?: DeviceCapabilityInput): string {
  if (typeof input?.userAgent === "string") return input.userAgent;
  return typeof navigator !== "undefined" ? navigator.userAgent : "";
}

function getCurrentHasDeviceOrientation(input?: DeviceCapabilityInput): boolean {
  if (typeof input?.hasDeviceOrientation === "boolean") return input.hasDeviceOrientation;
  return typeof DeviceOrientationEvent !== "undefined";
}

export function detectDeviceClass(input: DeviceCapabilityInput = {}): DeviceClass {
  const platform = getCurrentPlatform(input);
  if (platform && DESKTOP_TELEGRAM_PLATFORMS.has(platform)) return "desktop";
  if (platform && MOBILE_OR_TABLET_TELEGRAM_PLATFORMS.has(platform)) return "mobileOrTablet";

  const hasTouch = getCurrentHasTouch(input);
  const hasDeviceOrientation = getCurrentHasDeviceOrientation(input);
  if (hasTouch && hasDeviceOrientation) return "mobileOrTablet";

  const userAgent = getCurrentUserAgent(input);
  if (!hasTouch && /\b(Windows NT|Macintosh|X11|Linux x86_64|Linux i686)\b/i.test(userAgent)) {
    return "desktop";
  }

  return "unknown";
}

export function getCompassCapability(input: DeviceCapabilityInput = {}): CompassCapability {
  const deviceClass = detectDeviceClass(input);
  if (deviceClass === "desktop") return { eligible: false, reason: "desktop" };
  if (!getCurrentHasDeviceOrientation(input)) return { eligible: false, reason: "unsupported" };
  return { eligible: true };
}

export function extractCompassHeading(event: DeviceOrientationEvent): CompassHeading | null {
  const webkitEvent = event as WebKitDeviceOrientationEvent;
  const webkitHeading = finiteNumberOrNull(webkitEvent.webkitCompassHeading);
  if (webkitHeading !== null) {
    return {
      headingDeg: normalizeDegrees(webkitHeading),
      accuracyDeg: finiteNumberOrNull(webkitEvent.webkitCompassAccuracy),
      source: "webkitCompassHeading",
    };
  }

  const alpha = finiteNumberOrNull(event.alpha);
  if (event.absolute === true && alpha !== null) {
    return {
      headingDeg: normalizeDegrees(360 - alpha),
      accuracyDeg: null,
      source: "absoluteAlpha",
    };
  }

  return null;
}

function telegramLocationToFix(location: TelegramLocationData): LocationFix {
  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracyM: finiteNumberOrNull(location.horizontal_accuracy),
    source: "telegram",
  };
}

export function getCurrentLocationFix(): Promise<LocationFix | null> {
  return new Promise((resolve) => {
    const tgWA = getTelegramWebApp();
    const lm = tgWA?.LocationManager;

    if (tgWA && !lm) {
      resolve(null);
      return;
    }

    if (lm) {
      const doRequest = () => {
        lm.getLocation((loc) => {
          resolve(loc ? telegramLocationToFix(loc) : null);
        });
      };
      if (!lm.isInited) {
        lm.init(doRequest);
      } else {
        doRequest();
      }
      return;
    }

    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: finiteNumberOrNull(pos.coords.accuracy),
          source: "browser",
        }),
      () => resolve(null),
      { timeout: 10000, enableHighAccuracy: true },
    );
  });
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  const fix = await getCurrentLocationFix();
  return fix ? { lat: fix.lat, lng: fix.lng } : null;
}
