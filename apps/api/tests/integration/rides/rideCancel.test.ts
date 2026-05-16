import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { auditLog } from "../../../src/middleware/audit-log";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
/**
 * Integration: PATCH /api/rides/:id/cancel
 * - driver-only, active → cancelled
 * - cascade ride_requests pending|accepted → cancelled
 * - audit_log запись с daily_cancels
 * - 4-я отмена за день → flagged_for_review=true
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-cancel";

const DRIVER = {
  id: "00000000-0000-4000-c000-720000000001",
  tgId: 9820001,
  role: "user" as const,
};
const PASSENGER1 = {
  id: "00000000-0000-4000-c000-720000000002",
  tgId: 9820002,
  role: "user" as const,
};
const PASSENGER2 = {
  id: "00000000-0000-4000-c000-720000000003",
  tgId: 9820003,
  role: "user" as const,
};
const STRANGER = {
  id: "00000000-0000-4000-c000-720000000004",
  tgId: 9820004,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;

async function makeToken(u: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(u.tgId),
      uid: u.id,
      role: u.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
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

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` };
}

async function seedRide(): Promise<string> {
  return await withSystem(sql, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55, 49, 'B', 56, 50,
         NOW() + INTERVAL '5 hours', 3, 2, 'active')
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
        (${DRIVER.id}, ${DRIVER.tgId}, 'Cancel Driver'),
        (${PASSENGER1.id}, ${PASSENGER1.tgId}, 'Cancel P1'),
        (${PASSENGER2.id}, ${PASSENGER2.tgId}, 'Cancel P2'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'Cancel Stranger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
  });
});

afterAll(async () => {
  const ids = [DRIVER.id, PASSENGER1.id, PASSENGER2.id, STRANGER.id];
  await sql`DELETE FROM ride_requests WHERE passenger_id = ANY(${ids})`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  await sql.end();
});

beforeEach(async () => {
  // clean prior cancellations to keep daily count predictable
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
});

describe("PATCH /api/rides/:id/cancel", () => {
  it("200 — driver cancels active ride; cascade ride_requests", async () => {
    const rideId = await seedRide();
    await withSystem(sql, async (tx) => {
      await tx`
        INSERT INTO ride_requests (ride_id, passenger_id, status)
        VALUES
          (${rideId}, ${PASSENGER1.id}, 'pending'),
          (${rideId}, ${PASSENGER2.id}, 'accepted')
      `;
    });

    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("cancelled");
    expect(body.cancelled_requests).toBe(2);
    expect(body.flagged_for_review).toBe(false);

    const [ride] = await sql<{ status: string }[]>`SELECT status FROM rides WHERE id = ${rideId}`;
    expect(ride?.status).toBe("cancelled");

    const reqs = await sql<{ status: string }[]>`
      SELECT status FROM ride_requests WHERE ride_id = ${rideId}
    `;
    expect(reqs.every((r) => r.status === "cancelled")).toBe(true);

    const [audit] = await sql<{ action: string }[]>`
      SELECT action FROM audit_log
      WHERE user_id = ${DRIVER.id} AND entity_id = ${rideId}::uuid AND action = 'ride_cancel'
      ORDER BY created_at DESC LIMIT 1
    `;
    expect(audit?.action).toBe("ride_cancel");
  });

  it("403 — чужой пытается отменить", async () => {
    const rideId = await seedRide();
    const token = await makeToken(STRANGER);
    const res = await makeApp().request(`/api/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(403);
  });

  it("409 — уже cancelled", async () => {
    const rideId = await seedRide();
    await sql`UPDATE rides SET status = 'cancelled' WHERE id = ${rideId}`;
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(409);
  });

  it("404 — несуществующий ride", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request("/api/rides/00000000-0000-4000-c000-720000000099/cancel", {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  it("400 — invalid uuid", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request("/api/rides/garbage/cancel", {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(400);
  });

  it("4-я отмена за день — flagged_for_review=true", async () => {
    // Создаём 3 уже отменённых сегодня
    await withSystem(sql, async (tx) => {
      for (let i = 0; i < 3; i++) {
        await tx`
          INSERT INTO rides
            (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
             departure_at, seats_total, status, updated_at)
          VALUES
            (${DRIVER.id}, 'A', 55, 49, 'B', 56, 50,
             NOW() + INTERVAL '5 hours', 3, 'cancelled', NOW())
        `;
      }
    });

    const rideId = await seedRide();
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.flagged_for_review).toBe(true);
  });

  it("401 без auth", async () => {
    const rideId = await seedRide();
    const res = await makeApp().request(`/api/rides/${rideId}/cancel`, { method: "PATCH" });
    expect(res.status).toBe(401);
  });
});
