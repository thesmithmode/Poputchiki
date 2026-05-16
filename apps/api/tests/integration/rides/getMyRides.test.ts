/**
 * Integration tests: GET /api/rides/mine against real Postgres.
 * role=driver|passenger × when=future|past, RLS, driver_display_name.
 */
import { sessBind } from "../../helpers/auth";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { rateLimit } from "../../../src/middleware/rate-limit";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-getmyrides-integration";
const TEST_IP = "10.0.4.1";

const DRIVER = {
  id: "00000000-0000-4000-c000-d00000000001",
  tgId: 9101,
  role: "user" as const,
};
const PASSENGER = {
  id: "00000000-0000-4000-c000-d00000000002",
  tgId: 9102,
  role: "user" as const,
};
const OTHER_DRIVER = {
  id: "00000000-0000-4000-c000-d00000000003",
  tgId: 9103,
  role: "user" as const,
};

let sql: ReturnType<typeof createPool>;
let futureRideId: string;
let pastRideId: string;
let acceptedRideId: string;

async function makeToken(user: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(user.tgId),
      uid: user.id,
      role: user.role,
      typ: "access",
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 3600,
    },
    JWT_SECRET,
  );
}

function makeApp() {
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.set("socketIp" as never, "172.20.0.2");
    await next();
  });
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.use("/api/*", rateLimit(sql, { userLimit: 500, ipLimit: 5000 }));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

async function authedRequest(
  app: Hono,
  user: { id: string; tgId: number; role: string },
  path: string,
) {
  const token = await makeToken(user);
  return app.request(`/api/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      "X-Forwarded-For": TEST_IP,
    },
  });
}

beforeAll(async () => {
  sql = createPool(buildDsn());

  // Изолируем suite — другие suites грузят rides, конфликтуют с подсчётом.
  await sql`TRUNCATE TABLE ride_requests, ride_participation, rides RESTART IDENTITY CASCADE`;

  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, avatar_url, created_at)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Иван Водитель', 'https://t.me/photo1.jpg', NOW() - INTERVAL '10 days'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Анна Пассажир', NULL, NOW() - INTERVAL '5 days'),
        (${OTHER_DRIVER.id}, ${OTHER_DRIVER.tgId}, 'Другой Водитель', NULL, NOW() - INTERVAL '5 days')
      ON CONFLICT (tg_id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url
    `;
  });

  // future ride created by DRIVER
  const futureRows = await sql<{ id: string }[]>`
    INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
    VALUES (${DRIVER.id}, 'From', 55.75, 37.61, 'To', 55.80, 37.65, NOW() + INTERVAL '2 hours', 3)
    RETURNING id
  `;
  futureRideId = futureRows[0]?.id as string;

  // past ride created by DRIVER — bypass departure_at>NOW check via direct UPDATE
  const pastRows = await sql<{ id: string }[]>`
    INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
    VALUES (${DRIVER.id}, 'From2', 55.75, 37.61, 'To2', 55.80, 37.65, NOW() + INTERVAL '2 hours', 3)
    RETURNING id
  `;
  pastRideId = pastRows[0]?.id as string;
  await sql`UPDATE rides SET departure_at = NOW() - INTERVAL '1 hour' WHERE id = ${pastRideId}`;

  // OTHER_DRIVER ride — accepted PASSENGER as participant
  const otherRows = await sql<{ id: string }[]>`
    INSERT INTO rides (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_at, seats_total)
    VALUES (${OTHER_DRIVER.id}, 'X', 55.75, 37.61, 'Y', 55.80, 37.65, NOW() + INTERVAL '3 hours', 3)
    RETURNING id
  `;
  acceptedRideId = otherRows[0]?.id as string;
  await sql`
    INSERT INTO ride_requests (ride_id, passenger_id, status)
    VALUES (${acceptedRideId}, ${PASSENGER.id}, 'accepted')
  `;
});

afterAll(async () => {
  await sql`DELETE FROM ride_requests WHERE passenger_id = ${PASSENGER.id}`;
  await sql`DELETE FROM rides WHERE driver_id IN (${DRIVER.id}, ${OTHER_DRIVER.id})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${OTHER_DRIVER.id})`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`}`;
  await sql.end();
});

describe("GET /api/rides/mine", () => {
  it("role=driver&when=future вернёт будущие поездки водителя", async () => {
    const app = makeApp();
    const res = await authedRequest(app, DRIVER, "rides/mine?role=driver&when=future");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(1);
    expect(body.rides[0].id).toBe(futureRideId);
    expect(body.rides[0].driver_display_name).toBe("Иван Водитель");
    expect(body.rides[0].driver_photo_url).toBe("https://t.me/photo1.jpg");
    expect(body.rides[0].driver_tg_id).toBe(DRIVER.tgId);
  });

  it("role=driver&when=past вернёт прошлые поездки водителя", async () => {
    const app = makeApp();
    const res = await authedRequest(app, DRIVER, "rides/mine?role=driver&when=past");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(1);
    expect(body.rides[0].id).toBe(pastRideId);
  });

  it("role=passenger&when=future вернёт поездки где юзер accepted", async () => {
    const app = makeApp();
    const res = await authedRequest(app, PASSENGER, "rides/mine?role=passenger&when=future");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(1);
    expect(body.rides[0].id).toBe(acceptedRideId);
    expect(body.rides[0].driver_display_name).toBe("Другой Водитель");
  });

  it("role=passenger&when=past вернёт пусто если нет прошлых accepted", async () => {
    const app = makeApp();
    const res = await authedRequest(app, PASSENGER, "rides/mine?role=passenger&when=past");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(0);
  });

  it("default параметры → role=driver&when=future", async () => {
    const app = makeApp();
    const res = await authedRequest(app, DRIVER, "rides/mine");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(1);
    expect(body.rides[0].id).toBe(futureRideId);
  });

  it("role=invalid → fallback на driver", async () => {
    const app = makeApp();
    const res = await authedRequest(app, DRIVER, "rides/mine?role=hacker");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(1);
  });

  it("when=invalid → fallback на future", async () => {
    const app = makeApp();
    const res = await authedRequest(app, DRIVER, "rides/mine?when=garbage");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides[0].id).toBe(futureRideId);
  });

  it("PASSENGER не видит чужие driver поездки через role=driver", async () => {
    const app = makeApp();
    const res = await authedRequest(app, PASSENGER, "rides/mine?role=driver&when=future");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.rides).toHaveLength(0);
  });

  it("без токена → 401", async () => {
    const app = makeApp();
    const res = await app.request("/api/rides/mine", {
      headers: { "X-Forwarded-For": TEST_IP },
    });
    expect(res.status).toBe(401);
  });
});
