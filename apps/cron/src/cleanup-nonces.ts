import type postgres from "postgres";

const LOCK_ID = 100001;
const NONCE_TTL = "10 minutes";

export async function cleanupNonces(sql: postgres.Sql): Promise<{ deleted: number } | null> {
  const lockRows = await sql<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired
  `;
  const acquired = lockRows[0]?.acquired;

  if (!acquired) return null;

  try {
    const countRows = await sql<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM nonces
        WHERE created_at < now() - ${NONCE_TTL}::interval
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "nonce_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  } finally {
    await sql`SELECT pg_advisory_unlock(${LOCK_ID})`;
  }
}
