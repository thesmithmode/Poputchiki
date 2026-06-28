// Зона обслуживания Poputchiki: Казань + Царёво + окрестности.
export function inServiceArea(lat: number, lng: number): boolean {
  return lat >= 55.3 && lat <= 56.2 && lng >= 48.5 && lng <= 50.0;
}

export function routeInServiceArea(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): boolean {
  return inServiceArea(fromLat, fromLng) && inServiceArea(toLat, toLng);
}

export const SERVICE_AREA_ERROR = "Координаты за пределами зоны обслуживания";
