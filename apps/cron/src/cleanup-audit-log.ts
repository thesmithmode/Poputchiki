import type postgres from "postgres";
import { withLock } from "./lib/with-lock.js";

const LOCK_ID = 100004;
const RETENTION = "12 months";

export async function cleanupAuditLog(sql: postgres.Sql): Promise<{ deleted: number } | null> {
  return withLock(sql, LOCK_ID, async (tx) => {
    const countRows = await tx<{ count: number | string }[]>`
      WITH deleted AS (
        DELETE FROM audit_log
        WHERE created_at < now() - ${RETENTION}::interval
        RETURNING 1
      )
      SELECT COUNT(*) AS count FROM deleted
    `;
    const deleted = Number(countRows[0]?.count ?? 0);
    // biome-ignore lint/suspicious/noConsoleLog: structured cron log
    console.log(
      JSON.stringify({
        msg: "audit_log_cleanup",
        last_run_at: new Date().toISOString(),
        deleted_count: deleted,
      }),
    );
    return { deleted };
  });
}
