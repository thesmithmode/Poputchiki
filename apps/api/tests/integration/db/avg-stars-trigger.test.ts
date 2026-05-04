/**
 * Integration: avg_stars trigger (migration 013).
 * AFTER INSERT/UPDATE/DELETE on reviews → users.avg_stars + reviews_count.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { buildDsn } from "../setup";

const REVIEWER = { id: "00000000-0000-4000-f000-130000000001", tgId: 9130001 };
const TARGET = { id: "00000000-0000-4000-f000-130000000002", tgId: 9130002 };

let sql: ReturnType<typeof createPool>;

async function getStats(userId: string) {
  const [row] = await sql<{ avg_stars: string | null; reviews_count: number }[]>`
    SELECT avg_stars, reviews_count FROM users WHERE id = ${userId}
  `;
  return row ?? { avg_stars: null, reviews_count: 0 };
}

async function insertRide(): Promise<string> {
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total)
      VALUES
        (${TARGET.id}, 'A', 55, 49, 'B', 56, 50, NOW() - INTERVAL '2 hours', 2)
      RETURNING id
    `;
    return row?.id ?? "";
  });
}

const HOOK_TIMEOUT = 60000;

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${REVIEWER.id}, ${REVIEWER.tgId}, 'Avg Stars Reviewer'),
        (${TARGET.id}, ${TARGET.tgId}, 'Avg Stars Target')
      ON CONFLICT (tg_id) DO UPDATE SET avg_stars = NULL, reviews_count = 0
    `;
  });
}, HOOK_TIMEOUT);

afterAll(async () => {
  await sql`DELETE FROM reviews WHERE subject_id = ${REVIEWER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${TARGET.id}`;
  await sql`DELETE FROM users WHERE id IN (${REVIEWER.id}, ${TARGET.id})`;
  await sql.end();
}, HOOK_TIMEOUT);

beforeEach(async () => {
  await sql`DELETE FROM reviews WHERE subject_id = ${REVIEWER.id}`;
  await sql`UPDATE users SET avg_stars = NULL, reviews_count = 0 WHERE id = ${TARGET.id}`;
}, HOOK_TIMEOUT);

describe("avg_stars trigger", () => {
  it("INSERT 5 reviews → avg_stars=4.20, reviews_count=5", async () => {
    await withSystem(sql, async (tx) => {
      for (const stars of [5, 4, 3, 4, 5]) {
        const rideId = await insertRide();
        await tx`
          INSERT INTO reviews (ride_id, subject_id, target_id, stars)
          VALUES (${rideId}, ${REVIEWER.id}, ${TARGET.id}, ${stars})
        `;
      }
    });
    const stats = await getStats(TARGET.id);
    expect(Number(stats.avg_stars)).toBeCloseTo(4.2, 2);
    expect(stats.reviews_count).toBe(5);
  });

  it("DELETE одного → пересчёт", async () => {
    const rides = await Promise.all([insertRide(), insertRide(), insertRide()]);
    let lastId = "";
    const starsArr = [5, 4, 3];
    await withSystem(sql, async (tx) => {
      for (let i = 0; i < rides.length; i++) {
        const rideId = rides[i] ?? "";
        const stars = starsArr[i] ?? 0;
        const [row] = await tx<{ id: string }[]>`
          INSERT INTO reviews (ride_id, subject_id, target_id, stars)
          VALUES (${rideId}, ${REVIEWER.id}, ${TARGET.id}, ${stars})
          RETURNING id
        `;
        lastId = row?.id ?? "";
      }
    });
    await sql`DELETE FROM reviews WHERE id = ${lastId}`;
    const stats = await getStats(TARGET.id);
    expect(Number(stats.avg_stars)).toBeCloseTo(4.5, 2);
    expect(stats.reviews_count).toBe(2);
  });

  it("last DELETE → avg_stars=NULL, reviews_count=0", async () => {
    const rideId = await insertRide();
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO reviews (ride_id, subject_id, target_id, stars)
      VALUES (${rideId}, ${REVIEWER.id}, ${TARGET.id}, 3)
      RETURNING id
    `;
    await sql`DELETE FROM reviews WHERE id = ${row?.id ?? ""}`;
    const stats = await getStats(TARGET.id);
    expect(stats.avg_stars).toBeNull();
    expect(stats.reviews_count).toBe(0);
  });

  it(
    "100 concurrent INSERT → reviews_count=100",
    async () => {
      // Chunk to avoid pool exhaustion + row-lock contention on TARGET.id
      const CHUNK = 10;
      const rideIds: string[] = [];
      for (let i = 0; i < 100; i += CHUNK) {
        const batch = await Promise.all(Array.from({ length: CHUNK }, () => insertRide()));
        rideIds.push(...batch);
      }
      for (let i = 0; i < rideIds.length; i += CHUNK) {
        const slice = rideIds.slice(i, i + CHUNK);
        await Promise.all(
          slice.map(
            (rideId, j) =>
              sql`
              INSERT INTO reviews (ride_id, subject_id, target_id, stars)
              VALUES (${rideId}, ${REVIEWER.id}, ${TARGET.id}, ${((i + j) % 5) + 1})
            `,
          ),
        );
      }
      const stats = await getStats(TARGET.id);
      expect(stats.reviews_count).toBe(100);
    },
    HOOK_TIMEOUT,
  );
});
