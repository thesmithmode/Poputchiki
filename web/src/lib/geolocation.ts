import { getTelegramWebApp } from "./telegram";

export function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
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
          resolve(loc ? { lat: loc.latitude, lng: loc.longitude } : null);
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
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, enableHighAccuracy: true },
    );
  });
}
