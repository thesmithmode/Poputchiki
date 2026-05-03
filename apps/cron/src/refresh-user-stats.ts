import type postgres from "postgres";

const LOCK_ID = 100002;

export async function refreshUserStats(sql: postgres.Sql): Promise<{ refreshed: true } | null> {
  const lockRows = await sql<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired
  `;
  const acquired = lockRows[0]?.acquired;

  if (!acquired) return null;

  try {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats`;
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "user_stats_refresh",
        last_refresh_at: new Date().toISOString(),
      }),
    );
    return { refreshed: true };
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}
