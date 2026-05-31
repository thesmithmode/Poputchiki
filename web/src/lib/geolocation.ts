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

type WebKitDeviceOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number | null;
  webkitCompassAccuracy?: number | null;
};

function finiteNumberOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
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
