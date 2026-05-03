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
    return sql.begin(isolation, body) as Promise<T>;
  }
  return sql.begin(body) as Promise<T>;
}

// Used ONLY in /auth/ handlers before JWT is issued (bootstrap phase).
// Runs as DB superuser without RLS context — never use on /api/** routes.
export async function withSystem<T>(
  sql: postgres.Sql,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(fn) as Promise<T>;
}
