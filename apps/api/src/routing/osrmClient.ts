import polyline from "@mapbox/polyline";

export interface OsrmRoute {
  polyline: string;
  geometryWKT: string;
  distanceM: number;
  durationS: number;
}

export interface FetchRouteOptions {
  baseUrl?: string;
  _fetch?: typeof fetch;
  timeoutMs?: number;
}

export async function fetchRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  options?: FetchRouteOptions,
): Promise<OsrmRoute | null> {
  const baseUrl = options?.baseUrl ?? process.env.OSRM_URL ?? "http://localhost:5000";
  const fetchFn = options?._fetch ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 5000;

  const url = `${baseUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=polyline`;

  let res: Response;
  try {
    res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }

  if (!res.ok) return null;

  let json: { code: string; routes?: { geometry: string; distance: number; duration: number }[] };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return null;
  }

  const route = json.routes?.[0];
  if (json.code !== "Ok" || !route) return null;

  const encoded = route.geometry;
  const coords = polyline.decode(encoded);

  const wktParts = coords.map(([lat, lng]) => `${lng} ${lat}`).join(",");
  const geometryWKT = `LINESTRING(${wktParts})`;

  return {
    polyline: encoded,
    geometryWKT,
    distanceM: Math.round(route.distance),
    durationS: Math.round(route.duration),
  };
}
