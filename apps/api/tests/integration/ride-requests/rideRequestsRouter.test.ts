import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRideRequestsRouter } from "../../../src/ride-requests/rideRequestsRouter";
/**
 * Integration: POST /api/ride-requests/:id/{accept,reject,cancel}
 * Verifies state transitions, seats_taken refund, RLS isolation.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-requests";

const DRIVER = {
  id: "00000000-0000-4000-c000-700000000001",
  tgId: 9810101,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-c000-700000000002",
  tgId: 9810102,
  role: "user" as const,
};
const STRANGER = {
  id: "00000000-0000-4000-c000-700000000003",
  tgId: 9810103,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;
let rideId: string;

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
  app.route("/api/ride-requests", createRideRequestsRouter(sql));
  return app;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}` };
}

async function makeRequest(status: "pending" | "accepted" | "rejected" | "cancelled" = "pending") {
  return await withSystem(sql, async (tx) => {
    // reset rides + ride_requests
    await tx`DELETE FROM ride_requests WHERE ride_id = ${rideId}`;
    await tx`UPDATE rides SET seats_taken = 1 WHERE id = ${rideId}`;
    const [row] = await tx<{ id: string }[]>`
      INSERT INTO ride_requests (ride_id, passenger_id, status)
      VALUES (${rideId}, ${PASSENGER.id}, ${status})
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
        (${DRIVER.id}, ${DRIVER.tgId}, 'RR Driver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'RR Passenger'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'RR Stranger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    const [r] = await tx<{ id: string }[]>`
      INSERT INTO rides
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_at, seats_total, seats_taken, status)
      VALUES
        (${DRIVER.id}, 'A', 55, 49, 'B', 56, 50,
         NOW() + INTERVAL '5 hours', 3, 1, 'active')
      RETURNING id
    `;
    rideId = String(r?.id);
  });
});

afterAll(async () => {
  await sql`DELETE FROM ride_requests WHERE ride_id = ${rideId}`;
  await sql`DELETE FROM rides WHERE id = ${rideId}`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
  await sql.end();
});

describe("POST /api/ride-requests/:id/accept", () => {
  it("200 — driver accepts pending → status=accepted, seats_taken не меняется", async () => {
    const reqId = await makeRequest("pending");
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/accept`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("accepted");
    expect(body.seat_refunded).toBe(false);
    const [ride] = await sql<{ seats_taken: number }[]>`
      SELECT seats_taken FROM rides WHERE id = ${rideId}
    `;
    expect(ride?.seats_taken).toBe(1);
  });

  it("404 — чужой driver (RLS скрывает запрос — не утечка существования)", async () => {
    const reqId = await makeRequest("pending");
    const token = await makeToken(STRANGER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/accept`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(404);
  });

  it("404 — несуществующий request", async () => {
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(
      "/api/ride-requests/00000000-0000-4000-c000-700000000099/accept",
      {
        method: "POST",
        headers: authHeaders(token),
      },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/ride-requests/:id/reject", () => {
  it("200 — driver reject pending → seats_taken-=1", async () => {
    const reqId = await makeRequest("pending");
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/reject`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("rejected");
    expect(body.seat_refunded).toBe(true);
    const [ride] = await sql<{ seats_taken: number }[]>`
      SELECT seats_taken FROM rides WHERE id = ${rideId}
    `;
    expect(ride?.seats_taken).toBe(0);
  });

  it("409 — reject из status=accepted", async () => {
    const reqId = await makeRequest("accepted");
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/reject`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /api/ride-requests/:id/cancel", () => {
  it("200 — passenger cancel accepted → seats_taken-=1", async () => {
    const reqId = await makeRequest("accepted");
    const token = await makeToken(PASSENGER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("cancelled");
    expect(body.seat_refunded).toBe(true);
    const [ride] = await sql<{ seats_taken: number }[]>`
      SELECT seats_taken FROM rides WHERE id = ${rideId}
    `;
    expect(ride?.seats_taken).toBe(0);
  });

  it("403 — driver не может cancel", async () => {
    const reqId = await makeRequest("pending");
    const token = await makeToken(DRIVER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(403);
  });

  it("409 — cancel уже rejected", async () => {
    const reqId = await makeRequest("rejected");
    const token = await makeToken(PASSENGER);
    const res = await makeApp().request(`/api/ride-requests/${reqId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(409);
  });

  it("400 — invalid uuid", async () => {
    const token = await makeToken(PASSENGER);
    const res = await makeApp().request("/api/ride-requests/not-uuid/cancel", {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(400);
  });

  it("401 без auth", async () => {
    const reqId = await makeRequest("pending");
    const res = await makeApp().request(`/api/ride-requests/${reqId}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
