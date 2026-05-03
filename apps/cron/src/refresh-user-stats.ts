import type postgres from "postgres";

const LOCK_ID = 100002;

export async function refreshUserStats(sql: postgres.Sql): Promise<{ refreshed: true } | null> {
  const [{ acquired }] = await sql`
    SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired
  `;

  if (!acquired) return null;

  try {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats`;
    process.stdout.write(
      `${JSON.stringify({
        msg: "user_stats_refresh",
        last_refresh_at: new Date().toISOString(),
      })}\n`,
    );
    return { refreshed: true };
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}
