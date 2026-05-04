import postgres from "postgres";
import { cleanupAuditLog } from "./cleanup-audit-log";
import { cleanupNonces } from "./cleanup-nonces";
import { expandTemplates } from "./expand-templates";
import { finalizeRides } from "./finalize-rides";
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

async function runAuditLogCleanup() {
  // Monthly cleanup — only fire if UTC day === 1 and hour === 2
  const now = new Date();
  if (now.getUTCDate() !== 1 || now.getUTCHours() !== 2) return;
  await cleanupAuditLog(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "audit_log_cleanup_error", error: String(err) })),
  );
}

async function runExpandTemplates() {
  // Cron-style guard: only fire if current UTC hour === 3.
  if (new Date().getUTCHours() !== 3) return;
  await expandTemplates(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "expand_templates_error", error: String(err) })),
  );
}

async function runFinalizeRides() {
  await finalizeRides(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "finalize_rides_error", error: String(err) })),
  );
}

runCleanup();
runRefreshUserStats();
runExpandTemplates();
runAuditLogCleanup();
runFinalizeRides();
setInterval(runCleanup, FIVE_MIN);
setInterval(runRefreshUserStats, FIVE_MIN);
setInterval(runExpandTemplates, ONE_HOUR);
setInterval(runAuditLogCleanup, ONE_HOUR);
setInterval(runFinalizeRides, ONE_HOUR);
