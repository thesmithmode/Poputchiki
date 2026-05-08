import type postgres from "postgres";
import type { AppUser } from "../middleware/identity-guard";

export async function withIdentity<T>(
  sql: postgres.Sql,
  user: AppUser,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
  isolation?: string,
): Promise<T> {
  const body = async (tx: postgres.TransactionSql): Promise<T> => {
    await tx`
      SELECT
        set_config('app.current_user_id', ${user.id}, true),
        set_config('app.current_user_tg_id', ${String(user.tgId)}, true),
        set_config('app.current_user_role', ${user.role}, true)
    `;
    await tx`SET LOCAL ROLE poputchiki_app`;
    return fn(tx);
  };
  if (isolation) {
    // postgres.js append опций после BEGIN. Нормализуем уровень изоляции
    // в полный SQL clause: "repeatable read" → "ISOLATION LEVEL REPEATABLE READ".
    const clause = /^isolation level/i.test(isolation)
      ? isolation
      : `ISOLATION LEVEL ${isolation.toUpperCase()}`;
    return sql.begin(clause, body) as Promise<T>;
  }
  return sql.begin(body) as Promise<T>;
}

// Used ONLY in /auth/ handlers before JWT is issued (bootstrap phase),
// and for privileged system operations (cron cleanup, admin reads).
// Эскалирует до роли poputchiki_service внутри транзакции.
// После FIX-B2 runtime-коннект — poputchiki_app (не суперюзер).
// SET LOCAL ROLE poputchiki_service даёт доступ к таблицам без RLS ограничений
// (SELECT nonces для cleanup, SELECT error_log для admin, etc.).
export async function withSystem<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_service`;
    return fn(tx);
  }) as Promise<T>;
}
