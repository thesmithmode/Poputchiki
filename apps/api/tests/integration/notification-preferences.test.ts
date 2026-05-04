/**
 * Integration: notification_preferences table — RLS and structure.
 * Requires: Postgres + migrations 000-013 applied.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn } from "./setup";

const USER_A = "00000000-0000-4000-b000-100000000001";
const USER_B = "00000000-0000-4000-b000-100000000002";

let sql: ReturnType<typeof postgres>;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });
  // Seed users as superuser (bypasses RLS)
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER_A}, 9100001, 'NotifPref UserA'), (${USER_B}, 9100002, 'NotifPref UserB')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM notification_preferences WHERE user_id IN (${USER_A}, ${USER_B})`;
  await sql`DELETE FROM users WHERE id IN (${USER_A}, ${USER_B})`;
  await sql.end();
});

describe("notification_preferences RLS", () => {
  it("user can insert own preference", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`
        INSERT INTO notification_preferences (user_id, category, enabled)
        VALUES (${USER_A}, 'ride_request', false)
      `;
    });
    const rows =
      await sql`SELECT * FROM notification_preferences WHERE user_id = ${USER_A} AND category = 'ride_request'`;
    expect(rows.length).toBe(1);
    expect(rows[0]?.enabled).toBe(false);
  });

  it("user cannot insert preference for another user", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
        await tx`SELECT set_config('app.current_user_role', 'user', true)`;
        await tx`
          INSERT INTO notification_preferences (user_id, category, enabled)
          VALUES (${USER_B}, 'ride_request', false)
        `;
      }),
    ).rejects.toThrow();
  });

  it("user can read own preferences", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT * FROM notification_preferences WHERE user_id = ${USER_A}`;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.user_id === USER_A)).toBe(true);
  });

  it("user cannot read other user preferences", async () => {
    // USER_A tries to read USER_B's preferences — should see nothing
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`SELECT * FROM notification_preferences WHERE user_id = ${USER_B}`;
    });
    expect(rows.length).toBe(0);
  });

  it("deny-by-default: SELECT without identity returns nothing", async () => {
    // Insert direct as superuser first
    await sql`
      INSERT INTO notification_preferences (user_id, category, enabled)
      VALUES (${USER_B}, 'like_received', false)
      ON CONFLICT DO NOTHING
    `;
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      // No set_config for current_user_id
      return tx`SELECT * FROM notification_preferences`;
    });
    expect(rows.length).toBe(0);
  });

  it("rejects unknown category", async () => {
    await expect(
      sql`
        INSERT INTO notification_preferences (user_id, category, enabled)
        VALUES (${USER_A}, 'invalid_category', true)
      `,
    ).rejects.toThrow();
  });

  it("user can update own preference", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`
        UPDATE notification_preferences SET enabled = true
        WHERE user_id = ${USER_A} AND category = 'ride_request'
      `;
    });
    const rows =
      await sql`SELECT enabled FROM notification_preferences WHERE user_id = ${USER_A} AND category = 'ride_request'`;
    expect(rows[0]?.enabled).toBe(true);
  });

  it("user cannot update another user's preference", async () => {
    const affected = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`
        UPDATE notification_preferences SET enabled = true
        WHERE user_id = ${USER_B} AND category = 'like_received'
      `;
    });
    expect(affected.count).toBe(0);
  });
});
