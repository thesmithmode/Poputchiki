import postgres from "postgres";

export const POOL_CONFIG = {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 5,
} as const;

const _metrics = { in_use: 0, waiting: 0 };

export const poolMetrics = {
  snapshot: (): { max: number; in_use: number; waiting: number } => ({
    max: POOL_CONFIG.max,
    in_use: _metrics.in_use,
    waiting: _metrics.waiting,
  }),
} as const;

export function createPool(url: string): postgres.Sql {
  return postgres(url, POOL_CONFIG);
}

export async function withTx<T>(
  sql: postgres.Sql,
  level: "REPEATABLE READ" | "READ COMMITTED",
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  _metrics.in_use++;
  try {
    // postgres.js begin returns UnwrapPromiseArray<T>; for non-array T this equals T
    return (await sql.begin(`ISOLATION LEVEL ${level}`, fn)) as T;
  } finally {
    _metrics.in_use--;
  }
}

export async function withSerializable<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  _metrics.in_use++;
  try {
    return (await sql.begin("ISOLATION LEVEL SERIALIZABLE", fn)) as T;
  } finally {
    _metrics.in_use--;
  }
}
