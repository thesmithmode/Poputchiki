/**
 * Integration tests: pgcrypto helpers against real Postgres.
 * Requires: migrations 000-006 applied (decrypt_user_pii + encrypt_pii functions).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptUserPii, encryptPii } from "../../../src/db/crypto";
import { createPool } from "../../../src/db/pool";
import { withIdentity, withSystem } from "../../../src/db/with-identity";
import { buildDsn } from "../setup";

const PII_KEY = "test-pgcrypto-key-for-integration";

const USER_A = {
  id: "00000000-0000-4000-d000-c00000000001",
  tgId: 7701,
};
const USER_B = {
  id: "00000000-0000-4000-d000-c00000000002",
  tgId: 7702,
};

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());

  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER_A.id}, ${USER_A.tgId}, 'Crypto Test A')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER_B.id}, ${USER_B.tgId}, 'Crypto Test B')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${USER_A.id}, ${USER_B.id})`;
  await sql.end();
});

describe("encryptPii / decryptUserPii — round-trip", () => {
  it("encrypt → store → decrypt returns original plaintext", async () => {
    const phone = "+7 999 123 45 67";

    // Encrypt and store phone in a system transaction
    await withSystem(sql, async (tx) => {
      const enc = await encryptPii(tx, phone, PII_KEY);
      await tx`UPDATE users SET phone_enc = ${new Uint8Array(enc)} WHERE id = ${USER_A.id}`;
    });

    // Decrypt as the user (withIdentity sets app.current_user_id)
    const userA = { id: USER_A.id, tgId: USER_A.tgId, role: "user" };
    const result = await withIdentity(sql, userA, async (tx) => {
      return decryptUserPii(tx, USER_A.id, PII_KEY);
    });

    expect(result.phone).toBe(phone);
  });

  it("phone_enc stored as bytea (not plaintext)", async () => {
    const rows = await sql`SELECT phone_enc FROM users WHERE id = ${USER_A.id}`;
    const enc = rows[0]?.phone_enc;
    expect(enc).not.toBeNull();
    expect(typeof enc).not.toBe("string");
    // Should not contain the plaintext
    const encStr = String(enc);
    expect(encStr).not.toContain("+7 999 123 45 67");
  });

  it("два encrypt одного plaintext в одном statement дают разные ciphertext (IND-CPA)", async () => {
    // VOLATILE-контракт: pgp_sym_encrypt генерирует новый IV каждый вызов.
    // STABLE позволяет planner-у кешировать результат → IV переиспользуется → IND-CPA сломан.
    // Migration 029 переводит encrypt_pii / decrypt_user_pii в VOLATILE.
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('pgcrypto.key', ${PII_KEY}, true)`;
      return await tx<{ a: Buffer; b: Buffer }[]>`
        SELECT
          app.encrypt_pii('same-plaintext-for-iv-check') AS a,
          app.encrypt_pii('same-plaintext-for-iv-check') AS b
      `;
    });
    expect(rows[0]).toBeDefined();
    const a = rows[0]?.a;
    const b = rows[0]?.b;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(Buffer.compare(a as Buffer, b as Buffer)).not.toBe(0);
  });

  it("decrypt for wrong user → 0 rows (returns null fields)", async () => {
    // USER_B tries to decrypt USER_A's PII → should get null (not owner)
    const userB = { id: USER_B.id, tgId: USER_B.tgId, role: "user" };
    const result = await withIdentity(sql, userB, async (tx) => {
      return decryptUserPii(tx, USER_A.id, PII_KEY);
    });

    expect(result.phone).toBeNull();
    expect(result.apt_number).toBeNull();
  });
});
