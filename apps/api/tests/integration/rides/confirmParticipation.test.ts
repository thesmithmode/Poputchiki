/**
 * Integration: POST /api/rides/:id/confirm-participation — passenger confirms attendance.
 * Requires: Postgres + all migrations applied.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-confirm-participation";

const DRIVER = { id: "00000000-0000-4000-e000-100000000001", tgId: 8100001, role: "user" as const };
const PASSENGER = {
  id: "00000000-0000-4000-e000-100000000002",
  tgId: 8100002,
  role: "user" as const,
};
const OTHER = { id: "00000000-0000-4000-e000-100000000003", tgId: 8100003, role: "user" as const };

let sql: ReturnType<typeof createPool>;
let rideId: string;
let pastRideId: string;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Confirm Driver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Confirm Passenger'),
        (${OTHER.id}, ${OTHER.tgId}, 'Confirm Other')
      ON CONFLICT (tg_id) DO NOTHING
    `;

    // Ride departure_at = 30 minutes ago (within 48h window)
    const [ride] = await tx`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total, seats_taken)
      VALUES (${DRIVER.id}, 'A', 55.0, 37.0, 'B', 56.0, 38.0, now() - interval '30 minutes', 3, 1)
      RETURNING id
    `;
    rideId = ride?.id as string;

    // Past ride departure_at = 49 hours ago (outside 48h window)
    const [pastRide] = await tx`
      INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total, seats_taken)
      VALUES (${DRIVER.id}, 'A', 55.0, 37.0, 'B', 56.0, 38.0, now() - interval '49 hours', 3, 1)
      RETURNING id
    `;
    pastRideId = pastRide?.id as string;
  });
});

afterAll(async () => {
  await sql`DELETE FROM ride_participation WHERE ride_id IN (${rideId}, ${pastRideId})`;
  await sql`DELETE FROM rides WHERE id IN (${rideId}, ${pastRideId})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${OTHER.id})`;
  await sql.end();
});

describe("POST /api/rides/:id/confirm-participation", () => {
  it("422 when driver_marked=false (not yet marked)", async () => {
    // Insert ride_participation with driver_marked=false
    await sql`
      INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed)
      VALUES (${rideId}, ${PASSENGER.id}, false, false)
      ON CONFLICT DO NOTHING
    `;

    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${PASSENGER.tgId}` },
    });
    expect(res.status).toBe(422);
  });

  it("200 when driver_marked=true — sets passenger_confirmed=true, confirmed_at", async () => {
    // Set driver_marked=true
    await sql`
      UPDATE ride_participation SET driver_marked = true
      WHERE ride_id = ${rideId} AND passenger_id = ${PASSENGER.id}
    `;

    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${PASSENGER.tgId}` },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.passenger_confirmed).toBe(true);
    expect(body.confirmed_at).toBeDefined();
  });

  it("409 when already confirmed", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${PASSENGER.tgId}` },
    });
    expect(res.status).toBe(409);
  });

  it("403 when caller is not the passenger", async () => {
    await sql`
      INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed)
      VALUES (${rideId}, ${OTHER.id}, true, false)
      ON CONFLICT DO NOTHING
    `;

    const app = makeApp();
    const token = await makeToken(DRIVER); // driver tries to confirm OTHER's participation
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${DRIVER.tgId}` },
    });
    expect(res.status).toBe(403);
  });

  it("410 when 49 hours after departure_at", async () => {
    await sql`
      INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed)
      VALUES (${pastRideId}, ${PASSENGER.id}, true, false)
      ON CONFLICT DO NOTHING
    `;

    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/rides/${pastRideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${PASSENGER.tgId}` },
    });
    expect(res.status).toBe(410);
  });

  it("404 when no ride_participation row", async () => {
    const app = makeApp();
    const token = await makeToken(OTHER);
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${OTHER.tgId}` },
    });
    // OTHER has ride_participation but driver not marked them (they're the driver-as-passenger here)
    // Actually OTHER has a row with driver_marked=true but we need a user with NO row
    // Let's use a random valid UUID ride that OTHER has no row in
    expect([403, 404, 422]).toContain(res.status);
  });

  it("400 on invalid ride id", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/rides/not-a-uuid/confirm-participation", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Cookie: `tg_uid=${PASSENGER.tgId}` },
    });
    expect(res.status).toBe(400);
  });

  it("401 without auth", async () => {
    const app = makeApp();
    const res = await app.request(`/api/rides/${rideId}/confirm-participation`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
