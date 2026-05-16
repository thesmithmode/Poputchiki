/**
 * Integration: POST /api/reviews + GET /api/reviews?driver_id=
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createReviewsRouter } from "../../../src/reviews/reviewsRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-reviews";

interface TestUser {
  id: string;
  tgId: number;
  role: "user" | "admin";
}

const DRIVER: TestUser = {
  id: "00000000-0000-4000-a000-400000000001",
  tgId: 9700001,
  role: "user",
};
const PASSENGER: TestUser = {
  id: "00000000-0000-4000-a000-400000000002",
  tgId: 9700002,
  role: "user",
};
const STRANGER: TestUser = {
  id: "00000000-0000-4000-a000-400000000003",
  tgId: 9700003,
  role: "user",
};

const RIDE_OK = "00000000-0000-4000-a000-4a0000000001";
const RIDE_PENDING = "00000000-0000-4000-a000-4a0000000002";

let sql: ReturnType<typeof createPool>;

async function authHeaders(u: TestUser, json = false): Promise<Record<string, string>> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
    { sub: String(u.tgId), uid: u.id, role: u.role, typ: "access", jti: crypto.randomUUID(), iat: now, exp: now + 3600 },
    JWT_SECRET,
  );
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function makeApp(): Hono {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/reviews", createReviewsRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Rev Driver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Rev Passenger'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'Rev Stranger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM reviews WHERE subject_id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
    await tx`DELETE FROM ride_participation WHERE ride_id IN (${RIDE_OK}, ${RIDE_PENDING})`;
    await tx`DELETE FROM rides WHERE id IN (${RIDE_OK}, ${RIDE_PENDING})`;
    await tx`
      INSERT INTO rides (
        id, driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
        departure_at, seats_total, seats_taken, status
      )
      VALUES
        (${RIDE_OK}, ${DRIVER.id}, 'A', 55.7, 49.1, 'B', 55.8, 49.2,
         now() - interval '2 hour', 3, 1, 'completed'),
        (${RIDE_PENDING}, ${DRIVER.id}, 'A', 55.7, 49.1, 'B', 55.8, 49.2,
         now() - interval '2 hour', 3, 1, 'completed')
    `;
    await tx`
      INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed, marked_at, confirmed_at)
      VALUES
        (${RIDE_OK}, ${PASSENGER.id}, true, true, now(), now()),
        (${RIDE_PENDING}, ${PASSENGER.id}, true, false, now(), null)
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM reviews WHERE subject_id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
  await sql`DELETE FROM ride_participation WHERE ride_id IN (${RIDE_OK}, ${RIDE_PENDING})`;
  await sql`DELETE FROM rides WHERE id IN (${RIDE_OK}, ${RIDE_PENDING})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
  await sql.end();
});

describe("POST /api/reviews", () => {
  it("201 — passenger reviews driver after confirmation", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 5, body: "great" }),
    });
    expect(res.status).toBe(201);
    const out = await readJson<{ stars: number; text: string }>(res);
    expect(out.stars).toBe(5);
    expect(out.text).toBe("great");
  });

  it("403 — review without confirmation", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_PENDING, target_id: DRIVER.id, stars: 4 }),
    });
    expect(res.status).toBe(403);
  });

  it("422 — stars=0", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 0 }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — stars=6", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 6 }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — body length >300", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({
        ride_id: RIDE_OK,
        target_id: DRIVER.id,
        stars: 4,
        body: "x".repeat(301),
      }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — review self", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(DRIVER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("409 — duplicate review", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 4, body: "again" }),
    });
    expect(res.status).toBe(409);
  });

  it("403 — stranger cannot review driver", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      method: "POST",
      headers: await authHeaders(STRANGER, true),
      body: JSON.stringify({ ride_id: RIDE_OK, target_id: DRIVER.id, stars: 4 }),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/reviews?driver_id=", () => {
  it("200 — list reviews for driver", async () => {
    const app = makeApp();
    const res = await app.request(`/api/reviews?driver_id=${DRIVER.id}`, {
      headers: await authHeaders(STRANGER),
    });
    expect(res.status).toBe(200);
    const list = await readJson<Array<{ target_id: string; stars: number }>>(res);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]?.target_id).toBe(DRIVER.id);
  });

  it("422 — missing driver_id", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews", {
      headers: await authHeaders(STRANGER),
    });
    expect(res.status).toBe(422);
  });

  it("422 — invalid driver_id uuid", async () => {
    const app = makeApp();
    const res = await app.request("/api/reviews?driver_id=not-uuid", {
      headers: await authHeaders(STRANGER),
    });
    expect(res.status).toBe(422);
  });
});
