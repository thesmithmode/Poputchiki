import type postgres from "postgres";
import { withSystem } from "../db/with-identity";
import type { OsrmRoute } from "./osrmClient";

type RouteTable = "rides" | "ride_templates";

export async function saveRouteFields(
  sql: postgres.Sql,
  table: RouteTable,
  id: string,
  route: OsrmRoute,
): Promise<boolean> {
  const rows = await withSystem(sql, async (tx) => {
    return tx<{ id: string }[]>`
      UPDATE ${tx(table)}
      SET
        route_geom = ST_GeomFromText(${route.geometryWKT}, 4326),
        route_polyline = ${route.polyline},
        route_distance_m = ${route.distanceM},
        route_duration_s = ${route.durationS}
      WHERE id = ${id}
      RETURNING id
    `;
  });
  return rows.length > 0;
}

export async function clearRouteFields(
  sql: postgres.Sql,
  table: RouteTable,
  id: string,
): Promise<boolean> {
  const rows = await withSystem(sql, async (tx) => {
    return tx<{ id: string }[]>`
      UPDATE ${tx(table)}
      SET route_geom = NULL,
          route_polyline = NULL,
          route_distance_m = NULL,
          route_duration_s = NULL
      WHERE id = ${id}
      RETURNING id
    `;
  });
  return rows.length > 0;
}
