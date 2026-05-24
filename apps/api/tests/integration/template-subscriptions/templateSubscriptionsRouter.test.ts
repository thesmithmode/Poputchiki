import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createTemplateSubscriptionsRouter } from "../../../src/template-subscriptions/templateSubscriptionsRouter";
import { sessBind } from "../../helpers/auth";
import { readJson } from "../../helpers/json";
import { buildDsn } from "../setup";

/**
 * Integration: POST/GET /api/template-subscriptions + accept/reject/cancel/revoke
 * Requires: Postgres + all migrations applied.
 */

const JWT_SECRET = "test-secret-template-subs";

const DRIVER = { id: "00000000-0000-4000-b000-500000000001", tgId: 5550001, role: "user" as const };
const PASSENGER = {
  id: "00000000-0000-4000-b000-500000000002",
  tgId: 5550002,
  role: "user" as const,
};
const OTHER = { id: "00000000-0000-4000-b000-500000000003", tgId: 5550003, role: "user" as const };

let sql: ReturnType<typeof createPool>;
let templateId: string;

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
  app.route("/api/template-subscriptions", createTemplateSubscriptionsRouter(sql));
  return app;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
    "Content-Type": "application/json",
  };
}

beforeAll(async () => {
  sql = createPool(buildDsn());
  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name)
      VALUES
        (${DRIVER.id}, ${DRIVER.tgId}, 'SubDriver'),
        (${PASSENGER.id}, ${PASSENGER.tgId}, 'SubPassenger'),
        (${OTHER.id}, ${OTHER.tgId}, 'SubOther')
      ON CONFLICT (tg_id) DO NOTHING
    `;
    const [tmpl] = await tx<{ id: string }[]>`
      INSERT INTO ride_templates
        (driver_id, from_label, from_lat, from_lng, to_label, to_lat, to_lng,
         departure_time, weekdays, seats_total, active_from)
      VALUES (
        ${DRIVER.id}, 'ЖК Царёво', 55.75, 49.19, 'Казань', 55.78, 49.12,
        '08:30'::time, ARRAY[1,2,3,4,5], 3, current_date
      )
      RETURNING id
    `;
    if (!tmpl) throw new Error("Failed to create ride template");
    templateId = tmpl.id;
    await tx`DELETE FROM template_subscriptions WHERE passenger_id IN (${PASSENGER.id}, ${OTHER.id})`;
  });
});

afterAll(async () => {
  await withSystem(sql, async (tx) => {
    await tx`DELETE FROM template_subscriptions WHERE passenger_id IN (${PASSENGER.id}, ${OTHER.id})`;
    await tx`UPDATE ride_templates SET is_active = false WHERE id = ${templateId}`;
  });
  await sql.end();
});

describe("POST /api/template-subscriptions", () => {
  it("пассажир создаёт подписку → 201 pending", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/template-subscriptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ template_id: templateId }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.status).toBe("pending");
    expect(body.template_id).toBe(templateId);
    expect(body.passenger_id).toBe(PASSENGER.id);
  });

  it("дубль → 409 already_subscribed", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/template-subscriptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ template_id: templateId }),
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_subscribed");
  });

  it("водитель не может подписаться на свой шаблон → 403", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/template-subscriptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ template_id: templateId }),
    });
    expect(res.status).toBe(403);
  });

  it("несуществующий template_id → 404", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/template-subscriptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ template_id: "00000000-0000-4000-0000-000000000999" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/template-subscriptions/mine", () => {
  it("возвращает подписки пассажира", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/template-subscriptions/mine", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.subscriptions.length).toBeGreaterThan(0);
    expect(body.subscriptions[0].status).toBe("pending");
    expect(body.subscriptions[0].from_label).toBeDefined();
  });

  it("другой пользователь не видит чужие подписки", async () => {
    const app = makeApp();
    const token = await makeToken(OTHER);
    const res = await app.request("/api/template-subscriptions/mine", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.subscriptions.length).toBe(0);
  });
});

describe("GET /api/template-subscriptions/driver", () => {
  it("водитель видит pending заявки с именем пассажира", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/template-subscriptions/driver", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const pending = body.subscriptions.filter((s: { status: string }) => s.status === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].passenger_display_name).toBe("SubPassenger");
  });

  it("другой пользователь не видит pending водителя", async () => {
    const app = makeApp();
    const token = await makeToken(OTHER);
    const res = await app.request("/api/template-subscriptions/driver", {
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.subscriptions.length).toBe(0);
  });
});

describe("accept / reject / cancel / revoke", () => {
  let subId: string;

  beforeAll(async () => {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM template_subscriptions
      WHERE template_id = ${templateId} AND passenger_id = ${PASSENGER.id}
        AND status = 'pending'
    `;
    subId = row?.id ?? "";
  });

  it("только водитель может принять → другой user → 403", async () => {
    const app = makeApp();
    const token = await makeToken(OTHER);
    const res = await app.request(`/api/template-subscriptions/${subId}/accept`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(403);
  });

  it("водитель принимает → status=accepted", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(`/api/template-subscriptions/${subId}/accept`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("accepted");
  });

  it("accept повторно → 409 invalid_state", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(`/api/template-subscriptions/${subId}/accept`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(409);
  });

  it("водитель отзывает (revoke) → 200", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(`/api/template-subscriptions/${subId}/revoke`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
  });

  it("revoke accepted subscription → больше не видна водителю в /driver", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request("/api/template-subscriptions/driver", {
      headers: authHeaders(token),
    });
    const body = await readJson(res);
    const found = body.subscriptions.find((s: { id: string }) => s.id === subId);
    expect(found).toBeUndefined();
  });

  it("создать новую подписку для тестирования cancel", async () => {
    // Старую удалить чтобы UNIQUE позволил создать новую
    await withSystem(sql, async (tx) => {
      await tx`DELETE FROM template_subscriptions WHERE id = ${subId}`;
    });
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request("/api/template-subscriptions", {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ template_id: templateId, message: "тест cancel" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    subId = body.id;
  });

  it("пассажир отменяет pending → ok", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/template-subscriptions/${subId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(200);
  });

  it("отменить дважды → 409 invalid_state", async () => {
    const app = makeApp();
    const token = await makeToken(PASSENGER);
    const res = await app.request(`/api/template-subscriptions/${subId}/cancel`, {
      method: "POST",
      headers: authHeaders(token),
    });
    expect(res.status).toBe(409);
  });

  it("reject несуществующей подписки → 404", async () => {
    const app = makeApp();
    const token = await makeToken(DRIVER);
    const res = await app.request(
      "/api/template-subscriptions/00000000-0000-4000-0000-000000000999/reject",
      { method: "POST", headers: authHeaders(token) },
    );
    expect(res.status).toBe(404);
  });
});
