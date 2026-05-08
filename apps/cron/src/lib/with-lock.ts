import type postgres from "postgres";

export interface WithLockOptions {
  /**
   * Когда true — в начале транзакции выполняется `SET LOCAL ROLE poputchiki_service`.
   * Требуется для cleanup-задач, работающих с таблицами под FORCE RLS,
   * где DELETE-политика ограничена ролью poputchiki_service.
   * Требует: GRANT poputchiki_service TO poputchiki_app (есть в infra/postgres/init/01-app-role.sql).
   */
  useServiceRole?: boolean;
}

// Uses pg_try_advisory_xact_lock — transaction-scoped, auto-released at commit/rollback.
// All work in fn() runs in the same transaction, so same connection is guaranteed.
export async function withLock<T>(
  sql: postgres.Sql,
  lockId: number,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  options: WithLockOptions = {},
): Promise<T | null> {
  const result = await sql.begin(async (tx) => {
    if (options.useServiceRole) {
      await tx`SET LOCAL ROLE poputchiki_service`;
    }
    const rows = await tx<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(${lockId}) AS acquired
    `;
    if (!rows[0]?.acquired) return null;
    return fn(tx);
  });
  return result as T | null;
}
