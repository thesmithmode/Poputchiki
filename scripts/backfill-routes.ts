import { backfillRoutes } from "../apps/cron/src/route-backfill";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const osrmUrl = process.env.OSRM_URL ?? "http://localhost:5000";
  const sql = postgres(databaseUrl);

  const result = await backfillRoutes(sql, { osrmUrl, limit: 500 });

  console.log(JSON.stringify({ msg: "route_backfill_done", ...result }));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
