import type postgres from "postgres";

// Uses pg_try_advisory_xact_lock — transaction-scoped, auto-released at commit/rollback.
// All work in fn() runs in the same transaction, so same connection is guaranteed.
export async function withLock<T>(
  sql: postgres.Sql,
  lockId: number,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T | null> {
  const result = await sql.begin(async (tx) => {
    const rows = await tx<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${lockId}) AS acquired
    `;
    if (!rows[0]?.acquired) return null;
    return fn(tx);
  });
  return result as T | null;
}
