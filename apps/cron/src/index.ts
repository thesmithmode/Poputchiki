import postgres from "postgres";
import { detectAnomalies } from "./anomaly-detect";
import { runBackup, runBaseBackup, runRestoreTest } from "./backup";
import {
  cleanupErrorLog,
  cleanupIdempotencyKeys,
  cleanupNotificationLog,
  cleanupRateLimitBuckets,
} from "./cleanup";
import { cleanupAuditLog } from "./cleanup-audit-log";
import { cleanupNonces } from "./cleanup-nonces";
import { confirmParticipationPush } from "./confirm-participation-push";
import { expandTemplates } from "./expand-templates";
import { finalizeRides } from "./finalize-rides";
import { refreshUserStats } from "./refresh-user-stats";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const sql = postgres(DATABASE_URL);
const FIVE_MIN = 5 * 60 * 1000;
const TEN_MIN = 10 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

async function runCleanup() {
  await cleanupNonces(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "nonce_cleanup_error", error: String(err) })),
  );
}

async function runRateLimitBucketsCleanup() {
  await cleanupRateLimitBuckets(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "rate_limit_buckets_cleanup_error", error: String(err) })),
  );
}

async function runIdempotencyKeysCleanup() {
  await cleanupIdempotencyKeys(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "idempotency_keys_cleanup_error", error: String(err) })),
  );
}

async function runNotificationLogCleanup() {
  // 04:00 UTC daily
  if (new Date().getUTCHours() !== 4) return;
  await cleanupNotificationLog(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "notification_log_cleanup_error", error: String(err) })),
  );
}

async function runErrorLogCleanup() {
  // 04:00 UTC daily
  if (new Date().getUTCHours() !== 4) return;
  await cleanupErrorLog(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "error_log_cleanup_error", error: String(err) })),
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

async function runDailyBackup() {
  // 03:00 UTC daily
  if (new Date().getUTCHours() !== 3) return;
  await runBackup(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "backup_error", error: String(err) })),
  );
}

async function runWeeklyBaseBackup() {
  // 04:00 UTC Sunday (getUTCDay() === 0)
  const now = new Date();
  if (now.getUTCHours() !== 4 || now.getUTCDay() !== 0) return;
  await runBaseBackup(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "base_backup_error", error: String(err) })),
  );
}

async function runWeeklyRestoreTest() {
  // 05:00 UTC Sunday
  const now = new Date();
  if (now.getUTCHours() !== 5 || now.getUTCDay() !== 0) return;
  await runRestoreTest(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "restore_test_error", error: String(err) })),
  );
}

async function runFinalizeRides() {
  await finalizeRides(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "finalize_rides_error", error: String(err) })),
  );
}

async function runConfirmParticipationPush() {
  await confirmParticipationPush(sql).catch((err: unknown) =>
    console.error(JSON.stringify({ msg: "confirm_participation_push_error", error: String(err) })),
  );
}

runCleanup();
runRefreshUserStats();
runExpandTemplates();
runAuditLogCleanup();
runFinalizeRides();
runConfirmParticipationPush();
runDailyBackup();
runWeeklyBaseBackup();
runWeeklyRestoreTest();
runRateLimitBucketsCleanup();
runIdempotencyKeysCleanup();
runNotificationLogCleanup();
runErrorLogCleanup();
detectAnomalies(sql).catch((err: unknown) =>
  console.error(JSON.stringify({ msg: "anomaly_detect_error", error: String(err) })),
);
setInterval(runCleanup, FIVE_MIN);
setInterval(runRefreshUserStats, FIVE_MIN);
setInterval(runRateLimitBucketsCleanup, TEN_MIN);
setInterval(runExpandTemplates, ONE_HOUR);
setInterval(runAuditLogCleanup, ONE_HOUR);
setInterval(runIdempotencyKeysCleanup, ONE_HOUR);
setInterval(runNotificationLogCleanup, ONE_HOUR);
setInterval(runErrorLogCleanup, ONE_HOUR);
setInterval(runFinalizeRides, ONE_HOUR);
setInterval(runConfirmParticipationPush, 30 * 60 * 1000);
setInterval(runDailyBackup, ONE_HOUR);
setInterval(runWeeklyBaseBackup, ONE_HOUR);
setInterval(runWeeklyRestoreTest, ONE_HOUR);
setInterval(
  () =>
    detectAnomalies(sql).catch((err: unknown) =>
      console.error(JSON.stringify({ msg: "anomaly_detect_error", error: String(err) })),
    ),
  ONE_HOUR,
);
