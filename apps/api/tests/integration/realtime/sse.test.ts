/**
 * Integration tests: GET /api/realtime/rides — SSE endpoint.
 * Requires: Postgres + migrations applied.
 * TDD: tests written before implementation (TASK-038).
 */
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createRealtimeRouter } from "../../../src/realtime/realtimeRouter";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
import { buildDsn } from "../setup";

const JWT_SECRET = "test-secret-sse-integration";
const TEST_IP = "10.0.3.1";

const DRIVER = {
  id: "00000000-0000-4000-c000-300000000001",
  tgId: 9001,
  dbRole: "user" as const, // users.role constraint: only 'user'|'admin'
  jwtRole: "driver" as const, // JWT role for business logic
};

let sql: ReturnType<typeof createPool>;

async function makeToken(user: { id: string; tgId: number; role: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: String(user.tgId),
      uid: user.id,
      role: user.role,
      typ: "access",
      iat: now,
      exp: now + 3600,
      jti: randomUUID(),
    },
    JWT_SECRET,
  );
}

function makeApp(heartbeatMs = 15000) {
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.set("socketIp" as never, TEST_IP);
    await next();
  });
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/realtime", createRealtimeRouter(sql, { heartbeatMs }));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

function futureDate(hoursFromNow = 2): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

const BASE_RIDE = {
  from_label: "Старт",
  from_lat: 55.77,
  from_lng: 37.63,
  to_label: "Финиш",
  to_lat: 55.826,
  to_lng: 37.641,
  seats_total: 2,
};

/**
 * Reads SSE events from a Response stream.
 * Stops when `count` events collected OR timeout reached.
 * Returns array of "eventName:data" strings.
 */
async function collectSSEEvents(
  response: Response,
  count: number,
  timeoutMs: number,
): Promise<string[]> {
  const events: string[] = [];
  const reader = response.body?.getReader();
  if (!reader) return events;
  const decoder = new TextDecoder();
  const deadline = Date.now() + timeoutMs;

  try {
    while (events.length < count && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;

      const readPromise = reader.read();
      const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining),
      );

      const { done, value } = await Promise.race([readPromise, timeoutPromise]);
      if (done) break;
      if (!value) break;

      const text = decoder.decode(value);
      const matches = text.matchAll(/event: (\w+)\ndata: ([^\n]*)\n/g);
      for (const m of matches) {
        events.push(`${m[1]}:${m[2]}`);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return events;
}

beforeAll(async () => {
  sql = createPool(buildDsn());

  await withSystem(sql, async (tx) => {
    await tx`
      INSERT INTO users (id, tg_id, display_name, role, likes_received_count, created_at)
      VALUES (
        ${DRIVER.id}, ${DRIVER.tgId}, 'SSE Test Driver', ${DRIVER.dbRole}, 5,
        NOW() - INTERVAL '2 days'
      )
      ON CONFLICT (tg_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        likes_received_count = 5,
        created_at = NOW() - INTERVAL '2 days'
    `;
  });
});

afterEach(async () => {
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE ${`user:${DRIVER.id}%`}`;
});

afterAll(async () => {
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ${DRIVER.id}`;
  await sql.end();
});

describe("GET /api/realtime/rides — SSE", () => {
  it("401 без авторизации", async () => {
    const app = makeApp();
    const res = await app.request("/api/realtime/rides", { method: "GET" });
    expect(res.status).toBe(401);
  });

  it("200 + Content-Type: text/event-stream при успешной авторизации", async () => {
    const app = makeApp();
    const token = await makeToken({ id: DRIVER.id, tgId: DRIVER.tgId, role: DRIVER.jwtRole });

    const res = await app.request("/api/realtime/rides", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    // Закрываем поток
    await res.body?.cancel();
  });

  it("heartbeat события приходят с заданным интервалом", async () => {
    const app = makeApp(150); // heartbeatMs = 150ms для теста
    const token = await makeToken({ id: DRIVER.id, tgId: DRIVER.tgId, role: DRIVER.jwtRole });

    const res = await app.request("/api/realtime/rides", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);

    // За 600ms при интервале 150ms должны прийти минимум 2 heartbeat
    const events = await collectSSEEvents(res, 2, 600);
    const heartbeats = events.filter((e) => e.startsWith("heartbeat:"));
    expect(heartbeats.length).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it("ride_changed приходит после создания поездки", async () => {
    const app = makeApp(5000); // heartbeat редко чтобы не мешал
    const token = await makeToken({ id: DRIVER.id, tgId: DRIVER.tgId, role: DRIVER.jwtRole });

    // Подключаемся к SSE
    const sseRes = await app.request("/api/realtime/rides", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sseRes.status).toBe(200);

    // Запускаем чтение событий в фоне (до 2 событий или 3с)
    const collectPromise = collectSSEEvents(sseRes, 1, 3000);

    // Небольшая задержка чтобы SSE соединение установилось + PG LISTEN активирован
    await new Promise((r) => setTimeout(r, 100));

    // Создаём поездку
    const createRes = await app.request("/api/rides", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...BASE_RIDE, departure_at: futureDate() }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data?: { id: string }; id?: string };
    const rideId: string = (created.data?.id ?? created.id) as string;

    // Ждём событие
    const events = await collectPromise;
    const rideChangedEvents = events.filter((e) => e.startsWith("ride_changed:"));
    expect(rideChangedEvents.length).toBeGreaterThanOrEqual(1);

    // Данные события содержат ride_id
    const eventData = (rideChangedEvents[0] as string).slice("ride_changed:".length);
    const parsed = JSON.parse(eventData);
    expect(parsed).toMatchObject({ ride_id: rideId });
  }, 10_000);

  it("ride_changed приходит после отмены поездки", async () => {
    const app = makeApp(5000);
    const token = await makeToken({ id: DRIVER.id, tgId: DRIVER.tgId, role: DRIVER.jwtRole });

    // Сначала создаём поездку (без SSE)
    const createRes = await app.request("/api/rides", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...BASE_RIDE, departure_at: futureDate() }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { data?: { id: string }; id?: string };
    const rideId: string = (created.data?.id ?? created.id) as string;

    // Подключаемся к SSE
    const sseRes = await app.request("/api/realtime/rides", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sseRes.status).toBe(200);

    const collectPromise = collectSSEEvents(sseRes, 1, 3000);

    // Задержка для установки LISTEN
    await new Promise((r) => setTimeout(r, 100));

    // Отменяем поездку
    const cancelRes = await app.request(`/api/rides/${rideId}/cancel`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(cancelRes.status).toBe(200);

    // Ждём ride_changed
    const events = await collectPromise;
    const rideChangedEvents = events.filter((e) => e.startsWith("ride_changed:"));
    expect(rideChangedEvents.length).toBeGreaterThanOrEqual(1);

    const eventData = (rideChangedEvents[0] as string).slice("ride_changed:".length);
    const parsed = JSON.parse(eventData);
    expect(parsed).toMatchObject({ ride_id: rideId });
  }, 10_000);
});
