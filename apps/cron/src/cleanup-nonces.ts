import type postgres from "postgres";

const LOCK_ID = 100001;
const NONCE_TTL = "10 minutes";

export async function cleanupNonces(sql: postgres.Sql): Promise<{ deleted: number } | null> {
  const [{ acquired }] = await sql`
    SELECT pg_try_advisory_lock(${LOCK_ID}) AS acquired
  `;

  if (!acquired) return null;

  try {
    const [{ count }] = await sql`
      WITH deleted AS (
        DELETE FROM nonces
        WHERE created_at < now() - ${NONCE_TTL}::interval
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    const deleted = Number(count);
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
