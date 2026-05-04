import type postgres from "postgres";

const LOCK_ID = 100002;

// REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction,
// so withLock(tx) is not applicable here. We use sql.reserve() to pin a
// single connection, ensuring lock/unlock land on the same session.
export async function refreshUserStats(sql: postgres.Sql): Promise<{ refreshed: true } | null> {
  const reserved = await sql.reserve();
  try {
    const lockRows = await reserved<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired
    `;
    if (!lockRows[0]?.acquired) return null;

    try {
      await reserved`REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats`;
      // biome-ignore lint/suspicious/noConsoleLog: structured cron log
      console.log(
        JSON.stringify({
          msg: "user_stats_refresh",
          last_refresh_at: new Date().toISOString(),
        }),
      );
      return { refreshed: true };
    } finally {
      await reserved`SELECT pg_advisory_unlock(${LOCK_ID})`;
    }
  } finally {
    reserved.release();
  }
}
