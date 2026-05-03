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

function buildDsn(): string {
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST ?? "localhost"}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DB}`
  );
}

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
      await reserved.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
        await tx`SELECT set_config('app.current_user_role', 'user', true)`;
        const rows = await tx`SELECT id FROM users WHERE id = ${USER_A}`;
        expect(rows.length).toBe(1);
      });

      const leaked = await reserved.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        return tx`SELECT app.current_user_id() AS uid`;
      });
      expect(leaked[0]?.uid).toBeNull();

      const visibleRows = await reserved.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        return tx`SELECT id FROM users`;
      });
      expect(visibleRows.length).toBe(0);
    } finally {
      reserved.release();
    }
  });

  it("Even after many sequential identity-setting tx, fresh tx without identity sees 0 rows", async () => {
    const reserved = await sql.reserve();
    try {
      for (let i = 0; i < 5; i++) {
        await reserved.begin(async (tx) => {
          await tx`SET LOCAL ROLE poputchiki_app`;
          await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
          await tx`SELECT 1`;
        });
      }
      const rows = await reserved.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        return tx`SELECT id FROM users`;
      });
      expect(rows.length).toBe(0);
    } finally {
      reserved.release();
    }
  });
});
