/**
 * Sentinel: app.current_user_id GUC must be transaction-scoped (set_config local=true).
 * On a single pinned connection from the pool, transaction A sets identity X
 * and COMMITs. Transaction B in the same physical connection without set_config
 * must see app.current_user_id() = NULL and 0 rows from RLS-protected tables.
 *
 * If anyone changes set_config local from `true` → `false` (or uses SET without LOCAL),
 * this test goes red.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn } from "../integration/setup";

let sql: ReturnType<typeof postgres>;
const USER_A = randomUUID();

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 2 });
  await sql`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${USER_A}, ${800000000 + Math.floor(Math.random() * 1e6)}, 'Leak Test A', 'user')
    ON CONFLICT (id) DO NOTHING
  `;
});

afterAll(async () => {
  await sql`DELETE FROM users WHERE id = ${USER_A}`;
  await sql.end();
});

describe("Sentinel: identity GUC must not leak across transactions on same connection", () => {
  it("set_config(local=true) does not leak from tx A to tx B on pinned connection", async () => {
    const reserved = await sql.reserve();
    try {
      // tx A: identity set
      await reserved`BEGIN`;
      await reserved`SET LOCAL ROLE poputchiki_app`;
      await reserved`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await reserved`SELECT set_config('app.current_user_role', 'user', true)`;
      const rowsA = await reserved`SELECT id FROM users WHERE id = ${USER_A}`;
      expect(rowsA.length).toBe(1);
      await reserved`COMMIT`;

      // tx B: same connection, no identity → must see nothing
      await reserved`BEGIN`;
      await reserved`SET LOCAL ROLE poputchiki_app`;
      const leaked = await reserved`SELECT app.current_user_id() AS uid`;
      expect(leaked[0]?.uid).toBeNull();
      const visible = await reserved`SELECT id FROM users`;
      expect(visible.length).toBe(0);
      await reserved`COMMIT`;
    } finally {
      reserved.release();
    }
  });

  it("Even after many sequential identity-setting tx, fresh tx without identity sees 0 rows", async () => {
    const reserved = await sql.reserve();
    try {
      for (let i = 0; i < 5; i++) {
        await reserved`BEGIN`;
        await reserved`SET LOCAL ROLE poputchiki_app`;
        await reserved`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
        await reserved`SELECT 1`;
        await reserved`COMMIT`;
      }
      await reserved`BEGIN`;
      await reserved`SET LOCAL ROLE poputchiki_app`;
      const rows = await reserved`SELECT id FROM users`;
      expect(rows.length).toBe(0);
      await reserved`COMMIT`;
    } finally {
      reserved.release();
    }
  });
});
