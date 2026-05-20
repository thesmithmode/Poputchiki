import type postgres from "postgres";

// M4: ограничено до TransactionSql. set_config(..., true) — local scope (только в текущей tx).
// Передача plain Sql создаёт новый коннект на запрос → set_config теряется → decrypt без ключа.
export async function encryptPii(
  tx: postgres.TransactionSql,
  plaintext: string,
  key: string,
): Promise<Buffer> {
  await tx`SELECT set_config('pgcrypto.key', ${key}, true)`;
  const rows = await tx<{ enc: Buffer }[]>`SELECT app.encrypt_pii(${plaintext}) AS enc`;
  return rows[0]?.enc ?? Buffer.from("", "utf8");
}

export async function decryptUserPii(
  tx: postgres.TransactionSql,
  userId: string,
  key: string,
): Promise<{ phone: string | null; apt_number: string | null }> {
  await tx`SELECT set_config('pgcrypto.key', ${key}, true)`;
  const rows = await tx<{ phone: string | null; apt_number: string | null }[]>`
    SELECT * FROM app.decrypt_user_pii(${userId}::uuid)
  `;
  return rows[0] ?? { phone: null, apt_number: null };
}
