import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createUsersRouter } from "../../../src/users/usersRouter";
/**
 * Integration: GET /api/users/:id/schedule
 * Requires: Postgres + migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-users-schedule";

const DRIVER = {
  id: "00000000-0000-4000-d000-770000000001",
  tgId: 7770001,
  role: "user" as const,
};
const VIEWER = {
  id: "00000000-0000-4000-d000-770000000002",
  tgId: 7770002,
  role: "user" as const,
};
const BANNED_DRIVER = {
  id: "00000000-0000-4000-d000-770000000003",
  tgId: 7770003,
  role: "user" as const,
};
const DELETED_DRIVER = {
  id: "00000000-0000-4000-d000-770000000004",
  tgId: 7770004,
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

function makeApp() {
  const app = new Hono();
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/users", createUsersRouter(sql));
  return app;
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Sched Driver'),
        (${VIEWER.id}, ${VIEWER.tgId}, 'Sched Viewer'),
        (${BANNED_DRIVER.id}, ${BANNED_DRIVER.tgId}, 'Banned Sched Driver'),
        (${DELETED_DRIVER.id}, ${DELETED_DRIVER.tgId}, 'Deleted Sched Driver')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`
      UPDATE users
      SET is_banned = true, banned_at = now(), deleted_at = NULL
      WHERE id = ${BANNED_DRIVER.id}
    `;
    await tx`
      UPDATE users
      SET deleted_at = now(), is_banned = false
      WHERE id = ${DELETED_DRIVER.id}
    `;
    await tx`
      DELETE FROM ride_templates
      WHERE driver_id IN (${DRIVER.id}, ${BANNED_DRIVER.id}, ${DELETED_DRIVER.id})
    `;
    // 3 active templates
    await tx`
      INSERT INTO ride_templates (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_time, weekdays, seats_total)
      VALUES
        (${DRIVER.id}, 'A', 55.1, 49.1, 'B', 55.2, 49.2, '07:00', ARRAY[1,2,3,4,5]::smallint[], 3),
        (${DRIVER.id}, 'A', 55.1, 49.1, 'B', 55.2, 49.2, '08:30', ARRAY[1,2,3,4,5]::smallint[], 3),
        (${DRIVER.id}, 'A', 55.1, 49.1, 'B', 55.2, 49.2, '18:00', ARRAY[1,2,3,4,5]::smallint[], 3)
    `;
    // expired template (active_to in past)
    await tx`
      INSERT INTO ride_templates (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_time, weekdays, seats_total, active_to)
      VALUES
        (${DRIVER.id}, 'A', 55.1, 49.1, 'B', 55.2, 49.2, '06:00', ARRAY[1]::smallint[], 3, '2020-01-01')
    `;
    // soft-deleted template
    await tx`
      INSERT INTO ride_templates (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_time, weekdays, seats_total, is_active)
      VALUES
        (${DRIVER.id}, 'A', 55.1, 49.1, 'B', 55.2, 49.2, '23:00', ARRAY[6]::smallint[], 3, false)
    `;
    await tx`
      INSERT INTO ride_templates (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng, departure_time, weekdays, seats_total)
      VALUES
        (${BANNED_DRIVER.id}, 'Hidden Home', 55.1, 49.1, 'Hidden Office', 55.2, 49.2, '07:15', ARRAY[1,2]::smallint[], 3),
        (${DELETED_DRIVER.id}, 'Deleted Home', 55.1, 49.1, 'Deleted Office', 55.2, 49.2, '07:45', ARRAY[3,4]::smallint[], 3)
    `;
  });
});

afterAll(async () => {
  await sql`
    DELETE FROM ride_templates
    WHERE driver_id IN (${DRIVER.id}, ${BANNED_DRIVER.id}, ${DELETED_DRIVER.id})
  `;
  await sql`
    DELETE FROM users
    WHERE id IN (${DRIVER.id}, ${VIEWER.id}, ${BANNED_DRIVER.id}, ${DELETED_DRIVER.id})
  `;
  await sql.end();
});

describe("GET /api/users/:id/schedule", () => {
  it("200 — возвращает 3 активных шаблона, отсортированы по departure_time", async () => {
    const app = makeApp();
    const token = await makeToken(VIEWER);
    const res = await app.request(`/api/users/${DRIVER.id}/schedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(3);
    expect(body[0].departure_time).toBe("07:00");
    expect(body[1].departure_time).toBe("08:30");
    expect(body[2].departure_time).toBe("18:00");
    expect(body[0].weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(body[0].from_label).toBe("A");
    expect(body[0].to_label).toBe("B");
    expect(body[0].seats_total).toBe(3);
  });

  it("200 — VIEWER (не owner) видит расписание DRIVER (публично)", async () => {
    const app = makeApp();
    const token = await makeToken(VIEWER);
    const res = await app.request(`/api/users/${DRIVER.id}/schedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.length).toBe(3);
  });

  it("200 — пустой список для юзера без шаблонов", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(`/api/users/${VIEWER.id}/schedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual([]);
  });

  it("404 — не раскрывает расписание забаненного юзера", async () => {
    const app = makeApp();
    const token = await makeToken(VIEWER);
    const res = await app.request(`/api/users/${BANNED_DRIVER.id}/schedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: "not found" });
  });

  it("404 — не раскрывает расписание soft-deleted юзера", async () => {
    const app = makeApp();
    const token = await makeToken(VIEWER);
    const res = await app.request(`/api/users/${DELETED_DRIVER.id}/schedule`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(404);
    expect(await readJson(res)).toEqual({ error: "not found" });
  });

  it("400 — invalid uuid", async () => {
    const app = makeApp();
    const token = await makeToken(VIEWER);
    const res = await app.request("/api/users/not-uuid/schedule", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(400);
  });

  it("401 без auth", async () => {
    const app = makeApp();
    const res = await app.request(`/api/users/${DRIVER.id}/schedule`);
    expect(res.status).toBe(401);
  });
});
