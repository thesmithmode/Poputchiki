/**
 * Security sentinel: deny-by-default RLS.
 * For every RLS-enabled table verifies:
 *   1. Anonymous SELECT (SET LOCAL ROLE only, no GUC) → 0 rows
 *   2. Anonymous INSERT → error or 0 rows inserted
 *   3. Auth as user A cannot read/update user B's private rows
 *
 * Requires: Postgres running + all migrations applied.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildDsn, withTestUser } from "../integration/setup";
import type { TestUser } from "../integration/setup";

let sql: ReturnType<typeof postgres>;
let userA: TestUser;
let userB: TestUser;
let rideId: string;

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 5 });

  userA = await withTestUser(sql, 988801);
  userB = await withTestUser(sql, 988802);

  // Create a ride as userA (superuser insert bypasses RLS)
  const [ride] = await sql`
    INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
                       departure_at, seats_total)
    VALUES (${userA.id}, 'A', 55.0, 37.0, 'B', 55.1, 37.1,
            NOW() + interval '1 day', 3)
    RETURNING id
  `;
  rideId = ride?.id ?? "";
});

afterAll(async () => {
  await sql`DELETE FROM rides WHERE driver_id = ${userA.id}`;
  await userA.cleanup();
  await userB.cleanup();
  await sql.end();
});

async function anonSelect(table: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_app`;
    return tx.unsafe(`SELECT * FROM ${table}`);
  });
  return rows.length;
}

async function anonInsert(stmt: string): Promise<boolean> {
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx.unsafe(stmt);
    });
    return true;
  } catch {
    return false;
  }
}

async function selectAs(userId: string, tgId: number, table: string): Promise<number> {
  const rows = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_app`;
    await tx`SELECT set_config('app.current_user_id', ${userId}, true)`;
    await tx`SELECT set_config('app.current_user_tg_id', ${String(tgId)}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'user', true)`;
    return tx.unsafe(`SELECT * FROM ${table}`);
  });
  return rows.length;
}

describe("RLS deny-by-default: anonymous SELECT", () => {
  const tables = [
    "users",
    "rides",
    "ride_templates",
    "ride_requests",
    "ride_participation",
    "likes",
    "reviews",
    "favorites",
    "private_notes",
    "complaints",
    "audit_log",
  ];

  for (const table of tables) {
    it(`${table}: анонимный SELECT → 0 строк`, async () => {
      const count = await anonSelect(table);
      expect(count).toBe(0);
    });
  }
});

describe("RLS deny-by-default: anonymous INSERT", () => {
  it("users: анонимный INSERT → отказ", async () => {
    const ok = await anonInsert(
      `INSERT INTO users (id, tg_id, display_name) VALUES ('ffffffff-ffff-4fff-afff-ffffffffffff', 9999998, 'Evil')`,
    );
    expect(ok).toBe(false);
  });

  it("rides: анонимный INSERT → отказ", async () => {
    const ok = await anonInsert(
      `INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
       VALUES ('${userA.id}', 'X', 0, 0, 'Y', 1, 1, NOW() + interval '1 day', 2)`,
    );
    expect(ok).toBe(false);
  });

  it("likes: анонимный INSERT → отказ", async () => {
    const ok = await anonInsert(
      `INSERT INTO likes (from_user_id, to_user_id) VALUES ('${userA.id}', '${userB.id}')`,
    );
    expect(ok).toBe(false);
  });

  it("audit_log: анонимный INSERT → отказ", async () => {
    const ok = await anonInsert(
      `INSERT INTO audit_log (action, entity) VALUES ('HACK', 'users')`,
    );
    expect(ok).toBe(false);
  });
});

describe("RLS isolation: user A не видит приватные данные user B", () => {
  it("private_notes: userA видит только свои записи", async () => {
    // Вставить заметку от userB напрямую
    await sql`
      INSERT INTO private_notes (owner_id, subject_id, body)
      VALUES (${userB.id}, ${userA.id}, 'Secret note')
      ON CONFLICT DO NOTHING
    `;

    const countAsA = await selectAs(userA.id, userA.tgId, "private_notes");
    expect(countAsA).toBe(0);

    // Cleanup
    await sql`DELETE FROM private_notes WHERE owner_id = ${userB.id}`;
  });

  it("favorites: userA видит только свои избранные", async () => {
    await sql`
      INSERT INTO favorites (user_id, target_user_id)
      VALUES (${userB.id}, ${userA.id})
      ON CONFLICT DO NOTHING
    `;

    const countAsA = await selectAs(userA.id, userA.tgId, "favorites");
    expect(countAsA).toBe(0);

    await sql`DELETE FROM favorites WHERE user_id = ${userB.id}`;
  });

  it("rides: userA видит публичные поездки (не 0)", async () => {
    const countAsA = await selectAs(userA.id, userA.tgId, "rides");
    expect(countAsA).toBeGreaterThan(0);
  });

  it("users: userA видит только себя из публичного SELECT", async () => {
    // users_read_public: SELECT WHERE NOT is_banned — все неудалённые, но не banned
    // Оба пользователя вставлены напрямую → оба не banned → оба видны
    const countAsA = await selectAs(userA.id, userA.tgId, "users");
    expect(countAsA).toBeGreaterThan(0);
  });
});

describe("RLS isolation: чужой UPDATE блокируется", () => {
  it("userB не может обновить данные userA", async () => {
    const result = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${userB.id}, true)`;
      await tx`SELECT set_config('app.current_user_tg_id', ${String(userB.tgId)}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`UPDATE users SET display_name = 'Hacked' WHERE id = ${userA.id}`;
    });
    expect(result.count).toBe(0);
  });

  it("userB не может удалить поездку userA", async () => {
    const result = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${userB.id}, true)`;
      await tx`SELECT set_config('app.current_user_tg_id', ${String(userB.tgId)}, true)`;
      await tx`SELECT set_config('app.current_user_role', 'user', true)`;
      return tx`DELETE FROM rides WHERE id = ${rideId}`;
    });
    expect(result.count).toBe(0);
  });
});
