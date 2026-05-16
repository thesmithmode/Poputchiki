import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { createLikesRouter } from "../../../src/likes/likesRouter";
import { identityGuard } from "../../../src/middleware/identity-guard";
/**
 * Integration: POST/DELETE /api/likes
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-likes";

interface TestUser {
  id: string;
  tgId: number;
  role: "user" | "admin";
}

const DRIVER: TestUser = {
  id: "00000000-0000-4000-f000-300000000001",
  tgId: 9600001,
  role: "user",
};
const PASSENGER: TestUser = {
  id: "00000000-0000-4000-f000-300000000002",
  tgId: 9600002,
  role: "user",
};
const STRANGER: TestUser = {
  id: "00000000-0000-4000-f000-300000000003",
  tgId: 9600003,
  role: "user",
};

const RIDE_CONFIRMED = "00000000-0000-4000-f000-3a0000000001";
const RIDE_UNCONFIRMED = "00000000-0000-4000-f000-3a0000000002";

let sql: ReturnType<typeof createPool>;

async function authHeaders(u: TestUser, json = false): Promise<Record<string, string>> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
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
  app.route("/api/likes", createLikesRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Like Driver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'Like Passenger'),
        (${STRANGER.id}, ${STRANGER.tgId}, 'Like Stranger')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM likes WHERE subject_id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
    await tx`DELETE FROM ride_participation WHERE ride_id IN (${RIDE_CONFIRMED}, ${RIDE_UNCONFIRMED})`;
    await tx`DELETE FROM rides WHERE id IN (${RIDE_CONFIRMED}, ${RIDE_UNCONFIRMED})`;
    await tx`
      INSERT INTO rides (
        id, driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
        departure_at, seats_total, seats_taken, status
      )
      VALUES
        (${RIDE_CONFIRMED}, ${DRIVER.id}, 'A', 55.7, 49.1, 'B', 55.8, 49.2,
         now() - interval '1 hour', 3, 1, 'completed'),
        (${RIDE_UNCONFIRMED}, ${DRIVER.id}, 'A', 55.7, 49.1, 'B', 55.8, 49.2,
         now() - interval '1 hour', 3, 1, 'completed')
    `;
    await tx`
      INSERT INTO ride_participation (ride_id, passenger_id, driver_marked, passenger_confirmed, marked_at, confirmed_at)
      VALUES
        (${RIDE_CONFIRMED}, ${PASSENGER.id}, true, true, now(), now()),
        (${RIDE_UNCONFIRMED}, ${PASSENGER.id}, true, false, now(), null)
    `;
  });
});

afterAll(async () => {
  await sql`DELETE FROM likes WHERE subject_id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
  await sql`DELETE FROM ride_participation WHERE ride_id IN (${RIDE_CONFIRMED}, ${RIDE_UNCONFIRMED})`;
  await sql`DELETE FROM rides WHERE id IN (${RIDE_CONFIRMED}, ${RIDE_UNCONFIRMED})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${PASSENGER.id}, ${STRANGER.id})`;
  await sql.end();
});

describe("POST /api/likes", () => {
  it("201 — passenger likes driver after confirmation", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_CONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<{ subject_id: string; target_id: string; ride_id: string }>(res);
    expect(body.subject_id).toBe(PASSENGER.id);
    expect(body.target_id).toBe(DRIVER.id);
    expect(body.ride_id).toBe(RIDE_CONFIRMED);
  });

  it("403 — like without confirmation", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_UNCONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(403);
  });

  it("403 — stranger (not in ride) cannot like driver", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(STRANGER, true),
      body: JSON.stringify({ ride_id: RIDE_CONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(403);
  });

  it("409 — duplicate like", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_CONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(409);
  });

  it("422 — like self", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(DRIVER, true),
      body: JSON.stringify({ ride_id: RIDE_CONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — invalid uuid", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: "not-uuid", target_user_id: DRIVER.id }),
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/likes/:id", () => {
  it("204 — delete own like within 24h", async () => {
    const app = makeApp();
    const found = await sql<{ id: string }[]>`
      SELECT id FROM likes WHERE subject_id = ${PASSENGER.id} AND target_id = ${DRIVER.id} AND ride_id = ${RIDE_CONFIRMED}
    `;
    const likeId = found[0]?.id;
    const res = await app.request(`/api/likes/${likeId}`, {
      method: "DELETE",
      headers: await authHeaders(PASSENGER),
    });
    expect(res.status).toBe(204);
  });

  it("404 — non-existent id", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes/00000000-0000-4000-f000-3b0000000099", {
      method: "DELETE",
      headers: await authHeaders(PASSENGER),
    });
    expect(res.status).toBe(404);
  });

  it("410 — past 24h delete window", async () => {
    const app = makeApp();
    const post = await app.request("/api/likes", {
      method: "POST",
      headers: await authHeaders(PASSENGER, true),
      body: JSON.stringify({ ride_id: RIDE_CONFIRMED, target_user_id: DRIVER.id }),
    });
    expect(post.status).toBe(201);
    const created = await readJson<{ id: string }>(post);
    await sql`UPDATE likes SET created_at = now() - interval '25 hours' WHERE id = ${created.id}`;
    const res = await app.request(`/api/likes/${created.id}`, {
      method: "DELETE",
      headers: await authHeaders(PASSENGER),
    });
    expect(res.status).toBe(410);
  });

  it("400 — invalid uuid", async () => {
    const app = makeApp();
    const res = await app.request("/api/likes/not-uuid", {
      method: "DELETE",
      headers: await authHeaders(PASSENGER),
    });
    expect(res.status).toBe(400);
  });
});
