/**
 * Sentinel: integration test infra sanity check.
 * Verifies: DB reachable, RLS enforced, own row visible, other's row hidden.
 * Relies on setup.ts helpers introduced in TASK-129.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool";
import { withIdentity, withSystem } from "../../src/db/with-identity";
import type { AppUser } from "../../src/middleware/identity-guard";
import { buildDsn, withTestUser } from "./setup";

let sql: ReturnType<typeof createPool>;

beforeAll(async () => {
  sql = createPool(buildDsn());
});

afterAll(async () => {
  await sql.end();
});

describe("integration infra: DB connectivity", () => {
  it("executes a basic query", async () => {
    const rows = await sql`SELECT 1 AS val`;
    expect(Number(rows[0]?.val)).toBe(1);
  });
});

describe("integration infra: withTestUser isolation", () => {
  it("user sees own row and not another user's row via RLS", async () => {
    const userA = await withTestUser(sql, 977701);
    const userB = await withTestUser(sql, 977702);

    try {
      const appUserA: AppUser = { id: userA.id, tgId: userA.tgId, role: "user" };

      const rowsSeenByA = await withIdentity(sql, appUserA, async (tx) => {
        return tx<{ id: string }[]>`SELECT id FROM users WHERE id IN (${userA.id}, ${userB.id})`;
      });

      expect(rowsSeenByA.some((r) => r.id === userA.id)).toBe(true);
      expect(rowsSeenByA.some((r) => r.id === userB.id)).toBe(false);
    } finally {
      await userA.cleanup();
      await userB.cleanup();
    }
  });

  it("running the test twice does not fail on duplicate key (cleanup works)", async () => {
    const user = await withTestUser(sql, 977703);
    await user.cleanup();
    const user2 = await withTestUser(sql, 977703);
    expect(user2.id).toBeTruthy();
    expect(user2.tgId).toBe(977703);
    await user2.cleanup();
    const [row] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM users WHERE tg_id = 977703
    `;
    expect(row?.count).toBe(0);
  });
});

describe("integration infra: withSystem bypasses RLS", () => {
  it("withSystem can read all rows inserted by withTestUser", async () => {
    const user = await withTestUser(sql, 977704);
    try {
      const rows = await withSystem(sql, async (tx) => {
        return tx`SELECT id FROM users WHERE id = ${user.id}`;
      });
      expect(rows.length).toBe(1);
      expect(rows[0]?.id).toBe(user.id);
    } finally {
      await user.cleanup();
    }
  });
});
