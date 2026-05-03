/**
 * Integration: set_updated_at() triggers on rides, ride_templates, users, support_messages.
 * Requires: Postgres + all migrations applied.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn } from "../setup";

const USER_A = "00000000-0000-4000-c000-000000000001";

let sql: ReturnType<typeof postgres>;
let rideId: string;
let templateId: string;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 2 });

  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES (${USER_A}, 9300001, 'UpdatedAt Test User')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });

  // Create ride and template as app role
  const rideRows = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_app`;
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'user', true)`;
    return tx`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
      VALUES (${USER_A}, 'A', 55.0, 37.0, 'B', 56.0, 38.0, now() + interval '1 day', 2)
      RETURNING id
    `;
  });
  rideId = rideRows[0]?.id as string;

  const tplRows = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_app`;
    await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'user', true)`;
    return tx`
      INSERT INTO ride_templates (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_time, weekdays, seats_total)
      VALUES (${USER_A}, 'A', 55.0, 37.0, 'B', 56.0, 38.0, '08:00', '{1,2,3}', 2)
      RETURNING id
    `;
  });
  templateId = tplRows[0]?.id as string;
});

afterAll(async () => {
  await sql`DELETE FROM rides WHERE id = ${rideId}`;
  await sql`DELETE FROM ride_templates WHERE id = ${templateId}`;
  await sql`DELETE FROM users WHERE id = ${USER_A}`;
  await sql.end();
});

describe("set_updated_at trigger", () => {
  it("rides: UPDATE sets updated_at to now()", async () => {
    const before = await sql`SELECT updated_at FROM rides WHERE id = ${rideId}`;
    await new Promise((r) => setTimeout(r, 50));

    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`UPDATE rides SET comment = 'updated' WHERE id = ${rideId}`;
    });

    const after = await sql`SELECT updated_at FROM rides WHERE id = ${rideId}`;
    expect(after[0]?.updated_at.getTime()).toBeGreaterThan(before[0]?.updated_at.getTime());
  });

  it("rides: explicit SET updated_at is overridden by trigger", async () => {
    const staleDate = new Date("2020-01-01T00:00:00Z");
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`UPDATE rides SET updated_at = ${staleDate}, comment = 'override test' WHERE id = ${rideId}`;
    });

    const rows = await sql`SELECT updated_at FROM rides WHERE id = ${rideId}`;
    // Trigger should have overwritten the stale date
    expect(rows[0]?.updated_at.getTime()).toBeGreaterThan(staleDate.getTime());
  });

  it("ride_templates: UPDATE sets updated_at", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`UPDATE ride_templates SET comment = 'updated tpl' WHERE id = ${templateId}`;
    });

    const rows = await sql`SELECT updated_at FROM ride_templates WHERE id = ${templateId}`;
    expect(rows[0]?.updated_at).toBeDefined();
  });

  it("users: UPDATE sets updated_at", async () => {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${USER_A}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      await tx`UPDATE users SET display_name = 'Changed' WHERE id = ${USER_A}`;
    });

    const rows = await sql`SELECT updated_at FROM users WHERE id = ${USER_A}`;
    expect(rows[0]?.updated_at).toBeDefined();
  });

  it("support_messages: UPDATE sets updated_at", async () => {
    const [msg] = await sql`
      INSERT INTO support_messages (user_id, text)
      VALUES (${USER_A}, 'trigger test message')
      RETURNING id
    `;
    const msgId = msg?.id as string;

    await new Promise((r) => setTimeout(r, 50));
    await sql`UPDATE support_messages SET status = 'resolved' WHERE id = ${msgId}`;

    const rows = await sql`SELECT updated_at FROM support_messages WHERE id = ${msgId}`;
    expect(rows[0]?.updated_at).toBeDefined();

    await sql`DELETE FROM support_messages WHERE id = ${msgId}`;
  });
});
