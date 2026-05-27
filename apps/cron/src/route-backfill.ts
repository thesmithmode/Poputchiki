import type postgres from "postgres";

const DEFAULT_LIMIT = 25;
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_OSRM_URL = "http://osrm:5000";

interface RouteRow {
  id: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
}

interface OsrmPolylineRoute {
  code: string;
  routes?: { geometry: string; distance: number; duration: number }[];
}

interface OsrmGeoJsonRoute {
  code: string;
  routes?: {
    geometry: { coordinates: [number, number][] };
    distance: number;
    duration: number;
  }[];
}

interface RouteData {
  polyline: string;
  geometryWKT: string;
  distanceM: number;
  durationS: number;
}

type RouteSql = postgres.Sql | postgres.TransactionSql;

export interface BackfillRoutesOptions {
  osrmUrl?: string;
  limit?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  includeTemplates?: boolean;
  includeRides?: boolean;
}

export interface BackfillRoutesResult {
  templatesChecked: number;
  templatesUpdated: number;
  ridesChecked: number;
  ridesUpdated: number;
  failed: number;
}

async function fetchJson<T>(
  url: string,
  fetchFn: typeof fetch,
  timeoutMs: number,
): Promise<T | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function withServiceRole<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    return fn(tx);
  }) as Promise<T>;
}

async function fetchRoute(
  row: RouteRow,
  options: Required<Pick<BackfillRoutesOptions, "osrmUrl" | "timeoutMs" | "fetchFn">>,
): Promise<RouteData | null> {
  const coords = `${row.from_lng},${row.from_lat};${row.to_lng},${row.to_lat}`;
  const base = `${options.osrmUrl}/route/v1/driving/${coords}?overview=full`;
  const polylineJson = await fetchJson<OsrmPolylineRoute>(
    `${base}&geometries=polyline`,
    options.fetchFn,
    options.timeoutMs,
  );
  const geoJson = await fetchJson<OsrmGeoJsonRoute>(
    `${base}&geometries=geojson`,
    options.fetchFn,
    options.timeoutMs,
  );
  const polylineRoute = polylineJson?.routes?.[0];
  const geoRoute = geoJson?.routes?.[0];
  const geoCoords = geoRoute?.geometry?.coordinates;
  if (
    polylineJson?.code !== "Ok" ||
    geoJson?.code !== "Ok" ||
    !polylineRoute ||
    !geoRoute ||
    !geoCoords ||
    geoCoords.length < 2
  ) {
    return null;
  }

  const geometryWKT = `LINESTRING(${geoCoords.map(([lng, lat]) => `${lng} ${lat}`).join(",")})`;
  return {
    polyline: polylineRoute.geometry,
    geometryWKT,
    distanceM: Math.round(polylineRoute.distance),
    durationS: Math.round(polylineRoute.duration),
  };
}

async function updateRoute(
  sql: postgres.Sql,
  table: "ride_templates" | "rides",
  row: RouteRow,
  route: RouteData,
): Promise<boolean> {
  const rows = await withServiceRole(sql, async (tx) => {
    return tx<{ id: string }[]>`
      UPDATE ${tx(table)}
      SET
        route_geom = ST_GeomFromText(${route.geometryWKT}, 4326),
        route_polyline = ${route.polyline},
        route_distance_m = ${route.distanceM},
        route_duration_s = ${route.durationS}
      WHERE id = ${row.id} AND route_polyline IS NULL
      RETURNING id
    `;
  });
  return rows.length > 0;
}

async function backfillRows(
  sql: postgres.Sql,
  table: "ride_templates" | "rides",
  rows: RouteRow[],
  options: Required<Pick<BackfillRoutesOptions, "osrmUrl" | "timeoutMs" | "fetchFn">>,
): Promise<{ updated: number; failed: number }> {
  let updated = 0;
  let failed = 0;
  for (const row of rows) {
    const route = await fetchRoute(row, options);
    if (!route) {
      failed++;
      continue;
    }
    if (await updateRoute(sql, table, row, route)) updated++;
  }
  return { updated, failed };
}

export async function backfillRoutes(
  sql: postgres.Sql,
  options: BackfillRoutesOptions = {},
): Promise<BackfillRoutesResult> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const routeOptions = {
    osrmUrl: options.osrmUrl ?? process.env.OSRM_URL ?? DEFAULT_OSRM_URL,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    fetchFn: options.fetchFn ?? fetch,
  };
  const includeTemplates = options.includeTemplates ?? true;
  const includeRides = options.includeRides ?? true;

  const result: BackfillRoutesResult = {
    templatesChecked: 0,
    templatesUpdated: 0,
    ridesChecked: 0,
    ridesUpdated: 0,
    failed: 0,
  };

  if (includeTemplates) {
    const templates = await withServiceRole(sql, async (tx: RouteSql) => {
      return tx<RouteRow[]>`
        SELECT id, from_lat, from_lng, to_lat, to_lng
        FROM ride_templates
        WHERE route_polyline IS NULL AND is_active = true
        ORDER BY updated_at ASC
        LIMIT ${limit}
      `;
    });
    result.templatesChecked = templates.length;
    const stats = await backfillRows(sql, "ride_templates", templates, routeOptions);
    result.templatesUpdated = stats.updated;
    result.failed += stats.failed;
  }

  if (includeRides) {
    const rides = await withServiceRole(sql, async (tx: RouteSql) => {
      return tx<RouteRow[]>`
        SELECT id, from_lat, from_lng, to_lat, to_lng
        FROM rides
        WHERE route_polyline IS NULL AND status = 'active'
        ORDER BY departure_at ASC
        LIMIT ${limit}
      `;
    });
    result.ridesChecked = rides.length;
    const stats = await backfillRows(sql, "rides", rides, routeOptions);
    result.ridesUpdated = stats.updated;
    result.failed += stats.failed;
  }

  return result;
}
