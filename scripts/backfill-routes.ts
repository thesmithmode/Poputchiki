import postgres from "postgres";
import { fetchRoute } from "../apps/api/src/routing/osrmClient";

const BATCH_SIZE = 50;
const DELAY_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const osrmUrl = process.env.OSRM_URL ?? "http://localhost:5000";
  const sql = postgres(databaseUrl);

  let totalTemplates = 0;
  let totalRides = 0;

  // Pass 1: active ride_templates
  console.log("Pass 1: ride_templates...");
  // biome-ignore lint/suspicious/noExplicitAny: raw DB row
  let batch: any[];
  do {
    batch = await sql`
      SELECT id, from_lat, from_lng, to_lat, to_lng
      FROM ride_templates
      WHERE route_polyline IS NULL AND is_active = true
      LIMIT ${BATCH_SIZE}
    `;
    for (const row of batch) {
      const route = await fetchRoute(row.from_lat, row.from_lng, row.to_lat, row.to_lng, { baseUrl: osrmUrl });
      if (route) {
        await sql`
          UPDATE ride_templates SET
            route_geom = ST_GeomFromText(${route.geometryWKT}, 4326),
            route_polyline = ${route.polyline},
            route_distance_m = ${route.distanceM},
            route_duration_s = ${route.durationS}
          WHERE id = ${row.id}
        `;
        totalTemplates++;
      }
    }
    if (batch.length > 0) await sleep(DELAY_MS);
  } while (batch.length === BATCH_SIZE);

  // Pass 2: active rides
  console.log("Pass 2: rides...");
  do {
    batch = await sql`
      SELECT id, from_lat, from_lng, to_lat, to_lng
      FROM rides
      WHERE route_polyline IS NULL AND status = 'active'
      LIMIT ${BATCH_SIZE}
    `;
    for (const row of batch) {
      const route = await fetchRoute(row.from_lat, row.from_lng, row.to_lat, row.to_lng, { baseUrl: osrmUrl });
      if (route) {
        await sql`
          UPDATE rides SET
            route_geom = ST_GeomFromText(${route.geometryWKT}, 4326),
            route_polyline = ${route.polyline},
            route_distance_m = ${route.distanceM},
            route_duration_s = ${route.durationS}
          WHERE id = ${row.id}
        `;
        totalRides++;
      }
    }
    if (batch.length > 0) await sleep(DELAY_MS);
  } while (batch.length === BATCH_SIZE);

  console.log(`Done. Templates: ${totalTemplates}, Rides: ${totalRides}`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
