/**
 * Integration: Postgres connection pool + isolation levels.
 * Requires: Postgres running + migrations 000+001 applied.
 * Runs in CI only (POSTGRES_* env must be set).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, withSerializable, withTx } from "../../../src/db/pool";
import { buildDsn } from "../setup";

const UUID_A = "00000000-0000-4000-a000-101000000001";
const UUID_B = "00000000-0000-4000-a000-101000000002";

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());
  await sql`DELETE FROM users WHERE id IN (${UUID_A}, ${UUID_B})`;
  await sql`
    INSERT INTO users (id, tg_id, display_name)
    VALUES (${UUID_A}, 1010101, 'Pool Test A')
    ON CONFLICT DO NOTHING
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id IN (${UUID_A}, ${UUID_B})`;
  await sql.end();
});

describe("createPool: connectivity", () => {
  it("connects and executes a query", async () => {
    const rows = await sql`SELECT 1 AS val`;
    expect(Number(rows[0]?.val)).toBe(1);
  });
});

describe("withTx REPEATABLE READ: snapshot isolation", () => {
  it("does not see rows committed after tx start", async () => {
    let countBefore = "0";
    let countAfterExternalInsert = "0";

    await withTx(sql, "REPEATABLE READ", async (tx) => {
      const snap1 =
        await tx`SELECT COUNT(*) AS count FROM users WHERE id IN (${UUID_A}, ${UUID_B})`;
      countBefore = String(snap1[0]?.count ?? "0");

      // External commit while REPEATABLE READ tx is open
      await sql`
        INSERT INTO users (id, tg_id, display_name)
        VALUES (${UUID_B}, 2020202, 'Pool Test B')
        ON CONFLICT DO NOTHING
      `;

      const snap2 =
        await tx`SELECT COUNT(*) AS count FROM users WHERE id IN (${UUID_A}, ${UUID_B})`;
      countAfterExternalInsert = String(snap2[0]?.count ?? "0");
    });

    // Snapshot must not have advanced
    expect(countAfterExternalInsert).toBe(countBefore);

    // A fresh query outside the tx sees both rows
    const fresh = await sql`SELECT COUNT(*) AS count FROM users WHERE id IN (${UUID_A}, ${UUID_B})`;
    expect(Number(fresh[0]?.count)).toBeGreaterThan(Number(countBefore));
  });
});

describe("withSerializable: isolation level", () => {
  it("runs fn and returns its value", async () => {
    const result = await withSerializable(sql, async (tx) => {
      const rows = await tx`SELECT 42 AS val`;
      return Number(rows[0]?.val);
    });
    expect(result).toBe(42);
  });
});
