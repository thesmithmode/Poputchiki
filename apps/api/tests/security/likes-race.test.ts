/**
 * Sentinel: likes counter trigger atomicity under concurrent load.
 * 100 пар (subject, target, ride) → Promise.all INSERT likes →
 * users.likes_received_count для target должен быть ровно 100.
 * Проверяет trigger trg_likes_update_count (TASK-021, migration 007).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import type { AppUser } from "../../src/middleware/identity-guard";
import { withIdentity } from "../../src/db/with-identity";
import { buildDsn, withTestUser, truncateAll } from "../integration/setup";

describe("Sentinel: likes-race — trigger atomicity", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(buildDsn(), { max: 50 });
    await truncateAll(sql);
  });

  afterAll(async () => {
    await sql.end();
  });

  it("100 concurrent likes inserts (10 subjects × 10 rides) → likes_received_count=100", async () => {
    const target = await withTestUser(sql, 8000001n);
    const driver = await withTestUser(sql, 8000002n);

    const subjects = await Promise.all(
      Array.from({ length: 10 }, (_, i) => withTestUser(sql, BigInt(8100001 + i))),
    );

    const rides = await sql`
      INSERT INTO rides (driver_id, origin_lat, origin_lng, dest_lat, dest_lng, depart_at, seats_total, seats_taken, status)
      SELECT
        ${driver.id}::uuid,
        55.75, 37.62, 55.80, 37.70,
        now() + (n || ' hours')::interval,
        3, 0, 'active'
      FROM generate_series(1, 10) AS n
      RETURNING id
    `;

    // 10 subjects × 10 rides = 100 unique (subject, target, ride) pairs
    const inserts = subjects.flatMap((subject) =>
      rides.map((ride: { id: string }) =>
        withIdentity(
          sql,
          subject as unknown as AppUser,
          async (tx) => {
            await tx`
              INSERT INTO likes (subject_id, target_id, ride_id)
              VALUES (${subject.id}, ${target.id}, ${ride.id})
            `;
          },
        ).catch((err: unknown) => ({ error: err })),
      ),
    );

    const results = await Promise.all(inserts);
    const errors = results.filter((r) => r && (r as { error?: unknown }).error);
    expect(errors).toHaveLength(0);

    const [user] = await sql`
      SELECT likes_received_count FROM users WHERE id = ${target.id}
    `;
    expect(Number(user.likes_received_count)).toBe(100);

    await Promise.all(subjects.map((s) => s.cleanup()));
    await target.cleanup();
    await driver.cleanup();
  });
});
