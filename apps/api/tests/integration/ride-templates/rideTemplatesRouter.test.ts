import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRideTemplatesRouter } from "../../../src/ride-templates/rideTemplatesRouter";
/**
 * Integration: POST/GET/PATCH/DELETE /api/ride-templates
 * Requires: Postgres + all migrations applied.
 */
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-ride-templates";

const DRIVER = { id: "00000000-0000-4000-f000-700000000001", tgId: 9810001, role: "user" as const };
const OTHER = { id: "00000000-0000-4000-f000-700000000002", tgId: 9810002, role: "user" as const };

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
  app.route("/api/ride-templates", createRideTemplatesRouter(sql));
  return app;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
    "Content-Type": "application/json",
  };
}

const VALID_BODY = {
  from_label: "ЖК Царёво",
  from_lat: 55.751244,
  from_lng: 49.198674,
  to_label: "Казань Центр",
  to_lat: 55.78874,
  to_lng: 49.12214,
  departure_time: "08:30",
  weekdays: [1, 2, 3, 4, 5],
  price_rub: 200,
  seats_total: 3,
  comment: "Каждый будний день",
};

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'Tmpl Driver'),
        (${OTHER.id}, ${OTHER.tgId}, 'Tmpl Other')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    await tx`DELETE FROM ride_templates WHERE driver_id IN (${DRIVER.id}, ${OTHER.id})`;
  });
});

afterAll(async () => {
  await sql`DELETE FROM ride_templates WHERE driver_id IN (${DRIVER.id}, ${OTHER.id})`;
  await sql`DELETE FROM users WHERE id IN (${DRIVER.id}, ${OTHER.id})`;
  await sql.end();
});

describe("POST /api/ride-templates", () => {
  it("201 — создать шаблон", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.driver_id).toBe(DRIVER.id);
    expect(body.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(body.is_active).toBe(true);
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("422 — weekdays вне 0-6", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_BODY, weekdays: [7] }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — пустые weekdays", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_BODY, weekdays: [] }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — seats_total > 4", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_BODY, seats_total: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — invalid lat", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_BODY, from_lat: 91 }),
    });
    expect(res.status).toBe(422);
  });

  it("422 — invalid departure_time format", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ ...VALID_BODY, departure_time: "25:99" }),
    });
    expect(res.status).toBe(422);
  });

  it("401 без auth", async () => {
    const app = makeApp();
    const res = await app.request("/api/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/ride-templates/me", () => {
  it("200 — возвращает только мои активные шаблоны", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
    for (const t of body) expect(t.driver_id).toBe(DRIVER.id);
  });

  it("200 — OTHER видит свой пустой список", async () => {
    const app = makeApp();
    const token = await makeToken(OTHER);
    const res = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
});

describe("PATCH /api/ride-templates/:id", () => {
  it("200 — owner обновляет comment + price", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const list = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    const [tmpl] = await readJson(list);
    const res = await app.request(`/api/ride-templates/${tmpl.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ comment: "обновлено", price_rub: 250 }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.comment).toBe("обновлено");
    expect(body.price_rub).toBe(250);
  });

  it("404 — чужой PATCH не находит запись (RLS)", async () => {
    const app = makeApp();
    const driverToken = await makeToken(DRIVER);
    const list = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${driverToken}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, driverToken)}`,
      },
    });
    const [tmpl] = await readJson(list);

    const otherToken = await makeToken(OTHER);
    const res = await app.request(`/api/ride-templates/${tmpl.id}`, {
      method: "PATCH",
      headers: authHeaders(otherToken),
      body: JSON.stringify({ comment: "взлом" }),
    });
    expect(res.status).toBe(404);
  });

  it("400 — invalid uuid", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates/not-a-uuid", {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ comment: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("422 — пустое тело", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const list = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    const [tmpl] = await readJson(list);
    const res = await app.request(`/api/ride-templates/${tmpl.id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/ride-templates/:id", () => {
  it("204 — soft delete (is_active=false)", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const list = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    const [tmpl] = await readJson(list);

    const res = await app.request(`/api/ride-templates/${tmpl.id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(204);

    const after = await app.request("/api/ride-templates/me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    const items = await readJson(after);
    expect(items.find((t: { id: string }) => t.id === tmpl.id)).toBeUndefined();

    const row = await sql<{ is_active: boolean }[]>`
      SELECT is_active FROM ride_templates WHERE id = ${tmpl.id}
    `;
    expect(row[0]?.is_active).toBe(false);
  });

  it("404 — несуществующий id", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates/00000000-0000-4000-f000-700000000099", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(404);
  });

  it("400 — invalid uuid", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/ride-templates/garbage", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
      },
    });
    expect(res.status).toBe(400);
  });
});
