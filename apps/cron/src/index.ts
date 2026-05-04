import postgres from "postgres";
import { cleanupNonces } from "./cleanup-nonces";
import { expandTemplates } from "./expand-templates";
import { refreshUserStats } from "./refresh-user-stats";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const sql = postgres(DATABASE_URL);
const FIVE_MIN = 5 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

async function runCleanup() {
  await cleanupNonces(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "nonce_cleanup_error", error: String(err) })),
  );
}

async function runRefreshUserStats() {
  await refreshUserStats(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "user_stats_refresh_error", error: String(err) })),
  );
}

async function runExpandTemplates() {
  // Cron-style guard: only fire if current UTC hour === 3.
  if (new Date().getUTCHours() !== 3) return;
  await expandTemplates(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "expand_templates_error", error: String(err) })),
  );
}

runCleanup();
runRefreshUserStats();
runExpandTemplates();
setInterval(runCleanup, FIVE_MIN);
setInterval(runRefreshUserStats, FIVE_MIN);
setInterval(runExpandTemplates, ONE_HOUR);
