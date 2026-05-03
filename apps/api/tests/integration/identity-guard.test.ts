/**
 * Integration: identity-guard middleware + withIdentity helper.
 * Verifies that withIdentity correctly sets GUC so RLS policies apply.
 * Requires: Postgres running + migrations 000+001 applied.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool";
import { withIdentity } from "../../src/db/with-identity";

const required = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
  "JWT_SECRET",
];

function buildDsn(): string {
  for (const v of required.filter((v) => v !== "JWT_SECRET")) {
    if (!process.env[v]) throw new Error(`Missing env: ${v}`);
  }
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

const TEST_UUID = "00000000-0000-4000-a000-012000000001";
const TG_ID = 1201201201;

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());
  // Insert test user as superuser (bypasses RLS)
  await sql`DELETE FROM users WHERE id = ${TEST_UUID}`;
  await sql`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${TEST_UUID}, ${TG_ID}, 'Identity Guard Test', 'user')
    ON CONFLICT DO NOTHING
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${TEST_UUID}`;
  await sql.end();
});

describe("withIdentity: GUC propagation", () => {
  it("sets app.current_user_id so RLS allows reading own row", async () => {
    const user = { id: TEST_UUID, tgId: TG_ID, role: "user" };
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`SELECT id FROM users WHERE id = ${TEST_UUID}`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(TEST_UUID);
  });

  it("without withIdentity, SELECT returns 0 rows (RLS deny-by-default)", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      return tx`SELECT id FROM users WHERE id = ${TEST_UUID}`;
    });
    expect(rows.length).toBe(0);
  });

  it("withIdentity with another user id still reads public users (RLS users_read_public)", async () => {
    // Policy `users_read_public`: any authenticated user can read non-deleted users.
    // This sentinel asserts withIdentity sets GUC correctly (auth check passes for OTHER_UUID
    // even though row belongs to TEST_UUID). Strict ownership is enforced on writes only.
    const OTHER_UUID = "00000000-0000-4000-a000-012000000002";
    const user = { id: OTHER_UUID, tgId: 9999999, role: "user" };
    const rows = await withIdentity(sql, user, async (tx) => {
      return tx`SELECT id FROM users WHERE id = ${TEST_UUID}`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.id).toBe(TEST_UUID);
  });
});
