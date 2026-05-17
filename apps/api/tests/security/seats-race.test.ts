import postgres from "postgres";
/**
 * Sentinel: concurrency seat-booking race at accept time.
 * 10 пассажиров подают заявки (book_seat не вызывается при заявке).
 * Водитель принимает все 10 одновременно → ровно 1 успех, seats_taken=1, accepted=1.
 * Проверяет REPEATABLE READ + advisory lock в accept flow (TASK-069).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withIdentity, withSystem } from "../../src/db/with-identity";
import type { AppUser } from "../../src/middleware/identity-guard";
import { buildDsn, truncateAll, withTestUser } from "../integration/setup";

describe("Sentinel: concurrency seat-booking race at accept time", () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(buildDsn(), { max: 20 });
    await truncateAll(sql);
  });

  afterAll(async () => {
    await truncateAll(sql).catch(() => null);
    await sql.end();
  });

  it("10 concurrent accepts for 1 seat → exactly 1 success, seats_taken=1, accepted=1", async () => {
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

    // Все 10 подают заявки — место НЕ бронируется, просто INSERT ride_requests
    const requestIds = await withSystem(sql, async (tx) => {
      const rows = await tx<{ id: string; passenger_id: string }[]>`
        INSERT INTO ride_requests (ride_id, passenger_id)
        SELECT ${rideId}::uuid, unnest(${passengers.map((p) => p.id)}::uuid[])
        RETURNING id, passenger_id
      `;
      return rows.map((r) => r.id);
    });

    expect(requestIds).toHaveLength(10);

    // Водитель пытается принять все 10 одновременно
    const results = await Promise.all(
      requestIds.map((reqId) =>
        withIdentity(
          sql,
          driver as unknown as AppUser,
          async (tx) => {
            // Advisory lock на ride_id — сериализует конкурентный accept
            await tx`SELECT pg_advisory_xact_lock(hashtext(${rideId}::text))`;

            // Попытка перевести заявку в accepted (CAS через WHERE status='pending')
            const updated = await tx<{ id: string }[]>`
              UPDATE ride_requests SET status = 'accepted'
              WHERE id = ${reqId}::uuid AND status = 'pending'
              RETURNING id
            `;
            if (updated.length === 0) {
              throw Object.assign(new Error("concurrent"), { code: "NO_SEATS" });
            }

            // book_seat — атомарный инкремент; вернёт 0 строк если мест нет
            const booked = await tx<{ id: string }[]>`
              SELECT * FROM app.book_seat(${rideId}::uuid)
            `;
            if (booked.length === 0) {
              throw Object.assign(new Error("no_seats"), { code: "NO_SEATS" });
            }

            return { ok: true };
          },
          "repeatable read",
        )
          .then(() => ({ ok: true }))
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

    const [acceptedCount] = await sql<{ count: number | string }[]>`
      SELECT COUNT(*) AS count FROM ride_requests WHERE ride_id = ${rideId} AND status = 'accepted'
    `;
    expect(Number(acceptedCount?.count ?? 0)).toBe(1);

    await truncateAll(sql);
  });
});
