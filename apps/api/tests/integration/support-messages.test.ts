/**
 * Integration: support_messages table — RLS and structure.
 * Requires: Postgres + migrations 000-013 applied.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn } from "./setup";

const USER_A = "00000000-0000-4000-b000-200000000001";
const USER_B = "00000000-0000-4000-b000-200000000002";
const ADMIN  = "00000000-0000-4000-b000-200000000003";

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${ADMIN}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
    await tx`
      INSERT INTO users (id, tg_id, display_name, role)
      VALUES
        (${USER_A}, 9200001, 'SupportMsg UserA', 'user'),
        (${USER_B}, 9200002, 'SupportMsg UserB', 'user'),
        (${ADMIN},  9200003, 'SupportMsg Admin',  'admin')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM support_messages WHERE user_id IN (${USER_A}, ${USER_B})`;
  await sql`DELETE FROM users WHERE id IN (${USER_A}, ${USER_B}, ${ADMIN})`;
  await sql.end();
});

describe("support_messages RLS", () => {
  let msgIdA: string;

  it("user can insert own support message", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`
        INSERT INTO support_messages (user_id, text)
        VALUES (${USER_A}, 'Test support message from A')
        RETURNING id
      `;
    });
    expect(rows.length).toBe(1);
    msgIdA = rows[0]?.id as string;
  });

  it("user cannot insert message for another user", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
        await tx`SELECT set_config('app.current_user_role', 'user', true)`;
        await tx`
          INSERT INTO support_messages (user_id, text)
          VALUES (${USER_B}, 'Impersonation attempt')
        `;
      }),
    ).rejects.toThrow();
  });

  it("user can read own support messages", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT * FROM support_messages WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.user_id === USER_A)).toBe(true);
  });

  it("user cannot read another user's support messages", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_B}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT * FROM support_messages WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBe(0);
  });

  it("admin can read all support messages", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${ADMIN}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
      return tx`SELECT * FROM support_messages`;
    });
    expect(rows.length).toBeGreaterThan(0);
  });

  it("deny-by-default: SELECT without identity returns nothing", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      // No set_config for current_user_id
      return tx`SELECT * FROM support_messages`;
    });
    expect(rows.length).toBe(0);
  });

  it("default status is 'open'", async () => {
    const rows = await sql`SELECT status FROM support_messages WHERE id = ${msgIdA}`;
    expect(rows[0]?.status).toBe("open");
  });

  it("rejects empty text", async () => {
    await expect(
      sql`INSERT INTO support_messages (user_id, text) VALUES (${USER_A}, '')`,
    ).rejects.toThrow();
  });

  it("rejects text over 2000 chars", async () => {
    await expect(
      sql`INSERT INTO support_messages (user_id, text) VALUES (${USER_A}, ${"x".repeat(2001)})`,
    ).rejects.toThrow();
  });
});
