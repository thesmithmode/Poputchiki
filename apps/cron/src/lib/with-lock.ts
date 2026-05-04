import type postgres from "postgres";

export async function withLock<T>(
  sql: postgres.Sql,
  lockId: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  const rows = await sql<{ acquired: boolean }[]>`
    SELECT pg_try_advisory_lock(${lockId}) AS acquired
  `;
  if (!rows[0]?.acquired) return null;
  try {
    return await fn();
  } finally {
    await sql`SELECT pg_advisory_unlock(${lockId})`;
  }
}
