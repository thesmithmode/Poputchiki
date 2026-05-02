/**
 * Sentinel: RLS identity isolation.
 * Verifies that app.current_user_id GUC controls row visibility —
 * no leakage between transactions, deny-by-default without set_config.
 *
 * Requires: Postgres running + migrations 000 + 001 applied.
 * Runs in CI only (POSTGRES_* env must be set).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";

const required = ["POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_HOST", "POSTGRES_PORT", "POSTGRES_DB"];

function buildDsn(): string {
  for (const v of required) {
    if (!process.env[v]) throw new Error(`Missing env: ${v}`);
  }
  return (
    process.env["DATABASE_URL"] ??
    `postgres://${process.env["POSTGRES_USER"]}:${process.env["POSTGRES_PASSWORD"]}@${process.env["POSTGRES_HOST"]}:${process.env["POSTGRES_PORT"]}/${process.env["POSTGRES_DB"]}`
  );
}

let sql: ReturnType<typeof postgres>;
const TEST_UUID = "00000000-0000-4000-a000-000000000001";

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });

  // Seed one user for isolation tests — upsert as superuser (bypasses RLS)
  await sql`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${TEST_UUID}, 9999999, 'Test User', 'user')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${TEST_UUID}`;
  await sql.end();
});

describe("RLS: deny-by-default (no identity set)", () => {
  it("SELECT without set_config returns 0 rows", async () => {
    const rows = await sql.begin(async (tx) => {
      return tx`SELECT * FROM users`;
    });
    expect(rows.length).toBe(0);
  });

  it("app.current_user_id() returns NULL without set_config", async () => {
    const [row] = await sql.begin(async (tx) => {
      return tx`SELECT app.current_user_id() AS uid`;
    });
    expect(row!.uid).toBeNull();
  });
});

describe("RLS: identity isolation with set_config", () => {
  it("SELECT with own id returns own row only", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${TEST_UUID}, true)`;
      await tx`SELECT set_config('app.current_user_tg_id', '9999999', true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT id FROM users WHERE id = ${TEST_UUID}`;
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(TEST_UUID);
  });

  it("GUC does not leak between transactions", async () => {
    // First tx sets GUC
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${TEST_UUID}, true)`;
      return tx`SELECT id FROM users WHERE id = ${TEST_UUID}`;
    });

    // Second tx: no set_config — must see 0 rows
    const rows = await sql.begin(async (tx) => {
      return tx`SELECT id FROM users`;
    });
    expect(rows.length).toBe(0);
  });

  it("UPDATE without identity returns 0 rows updated", async () => {
    const result = await sql.begin(async (tx) => {
      return tx`UPDATE users SET display_name = 'Hacker' WHERE id = ${TEST_UUID}`;
    });
    expect(result.count).toBe(0);
  });

  it("UPDATE with wrong identity returns 0 rows updated", async () => {
    const OTHER_UUID = "00000000-0000-4000-a000-000000000002";
    const result = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${OTHER_UUID}, true)`;
      return tx`UPDATE users SET display_name = 'Hacker' WHERE id = ${TEST_UUID}`;
    });
    expect(result.count).toBe(0);
  });
});

describe("RLS: app identity functions", () => {
  it("app.current_user_id() returns set uuid", async () => {
    const [row] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_id', ${TEST_UUID}, true)`;
      return tx`SELECT app.current_user_id() AS uid`;
    });
    expect(row!.uid).toBe(TEST_UUID);
  });

  it("app.is_admin() returns false for role=user", async () => {
    const [row] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT app.is_admin() AS admin`;
    });
    expect(row!.admin).toBe(false);
  });

  it("app.is_admin() returns true for role=admin", async () => {
    const [row] = await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
      return tx`SELECT app.is_admin() AS admin`;
    });
    expect(row!.admin).toBe(true);
  });
});
