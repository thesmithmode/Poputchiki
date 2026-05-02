/**
 * Sentinel: rides RLS isolation.
 * Verifies driver-owns-ride policies and passenger request policies.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DRIVER_UUID = "00000000-0000-4000-a000-000000000010";
const PASSENGER_UUID = "00000000-0000-4000-a000-000000000011";

function buildDsn(): string {
  return (
    process.env.DATABASE_URL ??
    `postgres://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT}/${process.env.POSTGRES_DB}`
  );
}

let sql: ReturnType<typeof postgres>;
let rideId: string;

async function seedUser(tx: postgres.TransactionSql, id: string, tgId: number) {
  await tx`SELECT set_config('app.current_user_id', ${id}, true)`;
  await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
  await tx`
    INSERT INTO users (id, tg_id, display_name, role)
    VALUES (${id}, ${tgId}, ${`User ${tgId}`}, 'user')
    ON CONFLICT (id) DO NOTHING
  `;
}

beforeAll(async () => {
  sql = postgres(buildDsn(), { max: 3 });

  // Seed as superuser (bypasses RLS for insert)
  await sql.begin(async (tx) => {
    await seedUser(tx, DRIVER_UUID, 1000001);
    await seedUser(tx, PASSENGER_UUID, 1000002);
  });

  // Driver creates a ride — use app role so RLS policies apply
  const rows = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE poputchiki_app`;
    await tx`SELECT set_config('app.current_user_id', ${DRIVER_UUID}, true)`;
    await tx`SELECT set_config('app.current_user_role', 'user', true)`;
    return tx`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
      VALUES (${DRIVER_UUID}, 'ЖК Царёво', 55.75, 37.62, 'Метро', 55.72, 37.86, now() + interval '1 day', 3)
      RETURNING id
    `;
  });
  if (!rows[0]?.id) throw new Error("Failed to create test ride");
  rideId = rows[0].id as string;
});

afterAll(async () => {
  // Cleanup as superuser
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_user_role', 'admin', true)`;
    await tx`SELECT set_config('app.current_user_id', ${DRIVER_UUID}, true)`;
    await tx`DELETE FROM rides WHERE driver_id = ${DRIVER_UUID}`;
    await tx`DELETE FROM users WHERE id IN (${DRIVER_UUID}, ${PASSENGER_UUID})`;
  });
  await sql.end();
});

describe("Rides RLS: driver ownership", () => {
  it("driver can read own ride", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${DRIVER_UUID}, true)`;
      return tx`SELECT id FROM rides WHERE id = ${rideId}`;
    });
    expect(rows.length).toBe(1);
  });

  it("passenger can read ride (public read)", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${PASSENGER_UUID}, true)`;
      return tx`SELECT id FROM rides WHERE id = ${rideId}`;
    });
    expect(rows.length).toBe(1);
  });

  it("anon cannot read rides", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      return tx`SELECT id FROM rides`;
    });
    expect(rows.length).toBe(0);
  });

  it("passenger cannot update driver's ride", async () => {
    const result = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${PASSENGER_UUID}, true)`;
      return tx`UPDATE rides SET comment = 'hacked' WHERE id = ${rideId}`;
    });
    expect(result.count).toBe(0);
  });

  it("driver cannot insert ride for another driver", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${PASSENGER_UUID}, true)`;
        return tx`
          INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
          VALUES (${DRIVER_UUID}, 'From', 55.0, 37.0, 'To', 55.1, 37.1, now() + interval '2 days', 2)
        `;
      }),
    ).rejects.toThrow();
  });
});

describe("Ride requests RLS", () => {
  it("passenger can submit a request", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${PASSENGER_UUID}, true)`;
      return tx`
        INSERT INTO ride_requests (ride_id, passenger_id)
        VALUES (${rideId}, ${PASSENGER_UUID})
        RETURNING id
      `;
    });
    expect(rows.length).toBe(1);
  });

  it("passenger can read own request", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${PASSENGER_UUID}, true)`;
      return tx`SELECT id FROM ride_requests WHERE ride_id = ${rideId}`;
    });
    expect(rows.length).toBe(1);
  });

  it("driver can read requests for own ride", async () => {
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE poputchiki_app`;
      await tx`SELECT set_config('app.current_user_id', ${DRIVER_UUID}, true)`;
      return tx`SELECT id FROM ride_requests WHERE ride_id = ${rideId}`;
    });
    expect(rows.length).toBe(1);
  });

  it("passenger cannot submit request as another user", async () => {
    await expect(
      sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE poputchiki_app`;
        await tx`SELECT set_config('app.current_user_id', ${DRIVER_UUID}, true)`;
        return tx`
          INSERT INTO ride_requests (ride_id, passenger_id)
          VALUES (${rideId}, ${PASSENGER_UUID})
        `;
      }),
    ).rejects.toThrow();
  });
});
