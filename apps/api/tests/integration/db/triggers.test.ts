/**
 * Integration tests: counter trigger functions.
 * Requires: migrations 000-007 applied.
 * Tests: likes_received_count, rides_total_count, rides_completed_count.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";

const required = [
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_HOST",
  "POSTGRES_PORT",
  "POSTGRES_DB",
];

function buildDsn(): string {
  for (const v of required) {
    if (!process.env[v]) throw new Error(`Missing env: ${v}`);
  }
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

const DRIVER = { id: "00000000-0000-4000-e000-trigger00001", tgId: 8801 };
const PASSENGER = { id: "00000000-0000-4000-e000-trigger00002", tgId: 8802 };

let sql: ReturnType<typeof createPool>;

async function getCounters(userId: string) {
  const rows = await sql<
    { likes_received_count: number; rides_total_count: number; rides_completed_count: number }[]
  >`SELECT likes_received_count, rides_total_count, rides_completed_count FROM users WHERE id = ${userId}`;
  return rows[0] ?? { likes_received_count: 0, rides_total_count: 0, rides_completed_count: 0 };
}

async function insertRide(): Promise<string> {
  const rows = await sql`
    INSERT INTO rides
      (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
       departure_at, seats_total)
    VALUES
      (${DRIVER.id}, 'Trigger From', 55.0, 37.0, 'Trigger To', 56.0, 38.0,
       NOW() + INTERVAL '2 hours', 2)
    RETURNING id
  `;
  return rows[0]?.id as string;
}

beforeAll(async () => {
  sql = createPool(buildDsn());

  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, rides_total_count, rides_completed_count)
      VALUES (${DRIVER.id}, ${DRIVER.tgId}, 'Trigger Driver', 0, 0, 0)
      ON CONFLICT (tg_id) DO UPDATE SET
        likes_received_count = 0, rides_total_count = 0, rides_completed_count = 0
    `;
    await tx`
      INSERT INTO users (id, tg_id, display_name, likes_received_count, rides_total_count, rides_completed_count)
      VALUES (${PASSENGER.id}, ${PASSENGER.tgId}, 'Trigger Passenger', 0, 0, 0)
      ON CONFLICT (tg_id) DO UPDATE SET
        likes_received_count = 0, rides_total_count = 0, rides_completed_count = 0
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM likes WHERE subject_id IN (${DRIVER.id}, ${PASSENGER.id}) OR target_id IN (${DRIVER.id}, ${PASSENGER.id})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id})`;
  await sql.end();
});

describe("rides_total_count trigger", () => {
  it("INSERT ride → rides_total_count++ for driver", async () => {
    const before = await getCounters(DRIVER.id);
    await insertRide();
    const after = await getCounters(DRIVER.id);
    expect(after.rides_total_count).toBe(before.rides_total_count + 1);
  });
});

describe("rides_completed_count trigger", () => {
  it("UPDATE rides.status → 'completed' → rides_completed_count++", async () => {
    const rideId = await insertRide();
    const before = await getCounters(DRIVER.id);

    await sql`UPDATE rides SET status = 'completed' WHERE id = ${rideId}`;

    const after = await getCounters(DRIVER.id);
    expect(after.rides_completed_count).toBe(before.rides_completed_count + 1);
  });

  it("UPDATE to non-completed status → no counter change", async () => {
    const rideId = await insertRide();
    const before = await getCounters(DRIVER.id);

    await sql`UPDATE rides SET status = 'cancelled' WHERE id = ${rideId}`;

    const after = await getCounters(DRIVER.id);
    expect(after.rides_completed_count).toBe(before.rides_completed_count);
  });
});

describe("likes_received_count trigger", () => {
  it("INSERT like → target.likes_received_count++", async () => {
    const rideId = await insertRide();
    const before = await getCounters(DRIVER.id);

    await sql`
      INSERT INTO likes (subject_id, target_id, ride_id)
      VALUES (${PASSENGER.id}, ${DRIVER.id}, ${rideId})
    `;

    const after = await getCounters(DRIVER.id);
    expect(after.likes_received_count).toBe(before.likes_received_count + 1);
  });

  it("DELETE like → target.likes_received_count--", async () => {
    const rideId = await insertRide();
    await sql`INSERT INTO likes (subject_id, target_id, ride_id) VALUES (${PASSENGER.id}, ${DRIVER.id}, ${rideId})`;
    const before = await getCounters(DRIVER.id);

    await sql`DELETE FROM likes WHERE subject_id = ${PASSENGER.id} AND target_id = ${DRIVER.id} AND ride_id = ${rideId}`;

    const after = await getCounters(DRIVER.id);
    expect(after.likes_received_count).toBe(before.likes_received_count - 1);
  });
});
