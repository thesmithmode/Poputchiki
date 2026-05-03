import type postgres from "postgres";

type SqlOrTx = postgres.Sql | postgres.TransactionSql;

export async function encryptPii(sql: SqlOrTx, plaintext: string, key: string): Promise<Buffer> {
  await sql`SELECT set_config('pgcrypto.key', ${key}, true)`;
  const rows = await sql<{ enc: Buffer }[]>`SELECT app.encrypt_pii(${plaintext}) AS enc`;
  return rows[0]?.enc ?? Buffer.from("", "utf8");
}

export async function decryptUserPii(
  sql: SqlOrTx,
  userId: string,
  key: string,
): Promise<{ phone: string | null; apt_number: string | null }> {
  await sql`SELECT set_config('pgcrypto.key', ${key}, true)`;
  const rows = await sql<{ phone: string | null; apt_number: string | null }[]>`
    SELECT * FROM app.decrypt_user_pii(${userId}::uuid)
  `;
  return rows[0] ?? { phone: null, apt_number: null };
}
