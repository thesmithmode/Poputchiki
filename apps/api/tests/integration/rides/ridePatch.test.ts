/**
 * Integration: PATCH /api/rides/:id — driver edits future ride.
 */
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-patch";

const DRIVER = {
  id: "00000000-0000-4000-c000-710000000001",
  tgId: 9710001,
  role: "user" as const,
};
const STRANGER = {
  id: "00000000-0000-4000-c000-710000000002",
  tgId: 9710002,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-c000-710000000003",
  tgId: 9710003,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

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
  app.use("/api/*", auditLog(sql));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

function authHeaders(u: { tgId: number }, token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `tg_uid=${u.tgId}`,
    "Content-Type": "application/json",
  };
}

async function seedRide(
  opts: {
    past?: boolean;
    seats_total?: number;
    seats_taken?: number;
    status?: string;
  } = {},
): Promise<string> {
  const offset = opts.past ? "INTERVAL '-2 hours'" : "INTERVAL '5 hours'";
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55, 49, 'B', 56, 50,
         NOW() + ${tx.unsafe(offset)},
         ${opts.seats_total ?? 3}, ${opts.seats_taken ?? 0}, ${opts.status ?? "active"})
      RETURNING id
    `;
    return String(row?.id);
  });
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Patch Driver'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'Patch Stranger'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Patch Passenger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  const ids = [DRIVER.id, STRANGER.id, PASSENGER.id];
  await sql`DELETE FROM ride_requests WHERE passenger_id = ANY(${ids})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  await sql.end();
});

beforeEach(async () => {
  await sql`DELETE FROM ride_requests WHERE passenger_id = ${PASSENGER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
});

describe("PATCH /api/rides/:id", () => {
  it("200 — driver обновляет price_rub + comment", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ price_rub: 350, comment: "Обновил цену" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.price_rub).toBe(350);
    expect(body.comment).toBe("Обновил цену");
  });

  it("403 — STRANGER PATCH чужую ride", async () => {
    const rideId = await seedRide();
    const token = await makeToken(STRANGER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(STRANGER, token),
      body: JSON.stringify({ price_rub: 999 }),
    });
    expect(res.status).toBe(403);
  });

  it("410 — после departure_at", async () => {
    const rideId = await seedRide({ past: true });
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ price_rub: 100 }),
    });
    expect(res.status).toBe(410);
  });

  it("422 — seats_total ниже seats_taken", async () => {
    const rideId = await seedRide({ seats_total: 3, seats_taken: 2 });
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ seats_total: 1 }),
    });
    expect(res.status).toBe(422);
  });

  it("404 — несуществующий ride", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request("/api/rides/00000000-0000-4000-c000-710000000099", {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ price_rub: 100 }),
    });
    expect(res.status).toBe(404);
  });

  it("400 — invalid uuid", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request("/api/rides/garbage", {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ price_rub: 100 }),
    });
    expect(res.status).toBe(400);
  });

  it("422 — пустое тело", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("422 — invalid lat", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ from_lat: 999 }),
    });
    expect(res.status).toBe(422);
  });

  it("audit_log запись после успешного PATCH", async () => {
    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: authHeaders(DRIVER, token),
      body: JSON.stringify({ price_rub: 250 }),
    });
    expect(res.status).toBe(200);
    const [audit] = await sql<{ action: string }[]>`
      SELECT action FROM audit_log
      WHERE user_id = ${DRIVER.id} AND entity_id = ${rideId}::uuid AND action = 'ride_update'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit?.action).toBe("ride_update");
  });

  it("401 без auth", async () => {
    const rideId = await seedRide();
    const res = await makeApp().request(`/api/rides/${rideId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price_rub: 100 }),
    });
    expect(res.status).toBe(401);
  });
});
