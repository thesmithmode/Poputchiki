import postgres from "postgres";
/**
 * Sentinel: concurrency seat-booking race.
 * 10 пассажиров → 1 свободное место → ровно 1 успех, seats_taken=1, ride_requests=1.
 * Проверяет REPEATABLE READ изоляцию в withIdentity (TASK-069).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withIdentity } from "../../src/db/with-identity";
import type { AppUser } from "../../src/middleware/identity-guard";
import { buildDsn, truncateAll, withTestUser } from "../integration/setup";

describe("Sentinel: concurrency seat-booking race", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(buildDsn(), { max: 20 });
    await truncateAll(sql);
  });

  afterAll(async () => {
    await truncateAll(sql).catch(() => null);
    await sql.end();
  });

  it("10 concurrent requests for 1 seat → exactly 1 success, seats_taken=1, ride_requests=1", async () => {
    const driver = await withTestUser(sql, 9000001);

    const [ride] = await sql<{ id: string }[]>`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total, seats_taken, status)
      VALUES (${driver.id}, 'A', 55.75, 37.62, 'B', 55.80, 37.70, now() + interval '2 hours', 1, 0, 'active')
      RETURNING id
    `;
    if (!ride) throw new Error("ride insert failed");
    const rideId = ride.id;

    const passengers = await Promise.all(
      Array.from({ length: 10 }, (_, i) => withTestUser(sql, 9100001 + i)),
    );

    const results = await Promise.all(
      passengers.map((p) =>
        withIdentity(
          sql,
          p as unknown as AppUser,
          async (tx) => {
            const [updated] = await tx`
              SELECT * FROM app.book_seat(${rideId}::uuid)
            `;
            if (!updated) {
              throw Object.assign(new Error("no_seats"), { code: "NO_SEATS" });
            }
            const [rideRequest] = await tx`
              INSERT INTO ride_requests (ride_id, passenger_id)
              VALUES (${rideId}, ${p.id})
              RETURNING id
            `;
            return { ok: true, rideRequest };
          },
          "repeatable read",
        )
          .then((r) => ({ ok: true, rideRequest: r.rideRequest }))
          .catch((err: unknown) => ({
            ok: false,
            code: (err as { code?: string }).code ?? "UNKNOWN",
          })),
      ),
    );

    const successes = results.filter((r) => r.ok).length;
    expect(successes).toBe(1);

    const [rideState] = await sql<
      { seats_taken: number | string }[]
    >`SELECT seats_taken FROM rides WHERE id = ${rideId}`;
    expect(Number(rideState?.seats_taken ?? 0)).toBe(1);

    const [countRow] = await sql<{ count: number | string }[]>`
      SELECT COUNT(*) AS count FROM ride_requests WHERE ride_id = ${rideId}
    `;
    expect(Number(countRow?.count ?? 0)).toBe(1);

    // Cleanup: ride/ride_requests must die before users (FK rides_driver_id_fkey).
    // truncateAll handles cascade safely.
    await truncateAll(sql);
  });
});
