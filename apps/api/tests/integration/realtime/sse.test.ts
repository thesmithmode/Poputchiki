/**
 * Integration tests: GET /api/realtime/rides — SSE endpoint.
 * Requires: Postgres + migrations applied.
 * Uses Bun.serve (real HTTP) so stream.onAbort fires and finally block is covered.
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
  dbRole: "user" as const,
  jwtRole: "driver" as const,
};

let sql: ReturnType<typeof createPool>;
let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

async function makeAuthHeaders(user: { id: string; tgId: number; role: string }): Promise<
  Record<string, string>
> {
  const now = Math.floor(Date.now() / 1000);
  const token = await sign(
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
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `tg_uid=${user.tgId}`,
  };
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
 * Reads SSE events from a real fetch() Response stream.
 * Stops when `count` events collected OR timeout reached.
 * Returns array of "eventName:data" strings.
 */
async function collectSSEEvents(
  response: Response,
  count: number,
  timeoutMs: number,
  controller?: AbortController,
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
    controller?.abort();
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

  // Start real HTTP server on random port so stream.onAbort fires
  const app = makeApp();
  server = Bun.serve({ fetch: app.fetch, port: 0 });
  baseUrl = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE ${`user:${DRIVER.id}%`}`;
});

afterAll(async () => {
  server?.stop(true);
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ${DRIVER.id}`;
  await sql.end();
});

describe("GET /api/realtime/rides — SSE", () => {
  it("401 без авторизации", async () => {
    const res = await fetch(`${baseUrl}/api/realtime/rides`);
    expect(res.status).toBe(401);
    await res.body?.cancel();
  });

  it("200 + Content-Type: text/event-stream при успешной авторизации", async () => {
    const headers = await makeAuthHeaders({
      id: DRIVER.id,
      tgId: DRIVER.tgId,
      role: DRIVER.jwtRole,
    });

    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/realtime/rides`, {
      headers,
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    controller.abort();
    await res.body?.cancel();
  });

  it("heartbeat события приходят с заданным интервалом", async () => {
    // heartbeatMs=150ms — нужен отдельный сервер с этим параметром
    const app = makeApp(150);
    const srv = Bun.serve({ fetch: app.fetch, port: 0 });
    const url = `http://localhost:${srv.port}`;
    try {
      const headers = await makeAuthHeaders({
        id: DRIVER.id,
        tgId: DRIVER.tgId,
        role: DRIVER.jwtRole,
      });

      const controller = new AbortController();
      const res = await fetch(`${url}/api/realtime/rides`, {
        headers,
        signal: controller.signal,
      });

      expect(res.status).toBe(200);

      // За 600ms при интервале 150ms должны прийти минимум 2 heartbeat
      const events = await collectSSEEvents(res, 2, 600, controller);
      const heartbeats = events.filter((e) => e.startsWith("heartbeat:"));
      expect(heartbeats.length).toBeGreaterThanOrEqual(2);
    } finally {
      srv.stop(true);
    }
  }, 10_000);

  it("ride_changed приходит после создания поездки", async () => {
    // heartbeatMs=5000 — редко чтобы не мешал
    const app = makeApp(5000);
    const srv = Bun.serve({ fetch: app.fetch, port: 0 });
    const url = `http://localhost:${srv.port}`;
    try {
      const authHeaders = await makeAuthHeaders({
        id: DRIVER.id,
        tgId: DRIVER.tgId,
        role: DRIVER.jwtRole,
      });

      const controller = new AbortController();
      const sseRes = await fetch(`${url}/api/realtime/rides`, {
        headers: authHeaders,
        signal: controller.signal,
      });
      expect(sseRes.status).toBe(200);

      const collectPromise = collectSSEEvents(sseRes, 1, 3000, controller);

      // Задержка чтобы SSE соединение установилось + PG LISTEN активирован
      await new Promise((r) => setTimeout(r, 100));

      // Создаём поездку через основной сервер (baseUrl)
      const createRes = await fetch(`${baseUrl}/api/rides`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...BASE_RIDE, departure_at: futureDate() }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { data?: { id: string }; id?: string };
      const rideId: string = (created.data?.id ?? created.id) as string;

      const events = await collectPromise;
      const rideChangedEvents = events.filter((e) => e.startsWith("ride_changed:"));
      expect(rideChangedEvents.length).toBeGreaterThanOrEqual(1);

      const eventData = (rideChangedEvents[0] as string).slice("ride_changed:".length);
      const parsed = JSON.parse(eventData);
      expect(parsed).toMatchObject({ ride_id: rideId });
    } finally {
      srv.stop(true);
    }
  }, 10_000);

  it("ride_changed приходит после отмены поездки", async () => {
    const app = makeApp(5000);
    const srv = Bun.serve({ fetch: app.fetch, port: 0 });
    const url = `http://localhost:${srv.port}`;
    try {
      const authHeaders = await makeAuthHeaders({
        id: DRIVER.id,
        tgId: DRIVER.tgId,
        role: DRIVER.jwtRole,
      });

      // Создаём поездку через основной сервер
      const createRes = await fetch(`${baseUrl}/api/rides`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...BASE_RIDE, departure_at: futureDate() }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as { data?: { id: string }; id?: string };
      const rideId: string = (created.data?.id ?? created.id) as string;

      const controller = new AbortController();
      const sseRes = await fetch(`${url}/api/realtime/rides`, {
        headers: authHeaders,
        signal: controller.signal,
      });
      expect(sseRes.status).toBe(200);

      const collectPromise = collectSSEEvents(sseRes, 1, 3000, controller);

      // Задержка для установки LISTEN
      await new Promise((r) => setTimeout(r, 100));

      // Отменяем через основной сервер
      const cancelRes = await fetch(`${baseUrl}/api/rides/${rideId}/cancel`, {
        method: "PATCH",
        headers: authHeaders,
      });
      expect(cancelRes.status).toBe(200);

      const events = await collectPromise;
      const rideChangedEvents = events.filter((e) => e.startsWith("ride_changed:"));
      expect(rideChangedEvents.length).toBeGreaterThanOrEqual(1);

      const eventData = (rideChangedEvents[0] as string).slice("ride_changed:".length);
      const parsed = JSON.parse(eventData);
      expect(parsed).toMatchObject({ ride_id: rideId });
    } finally {
      srv.stop(true);
    }
  }, 10_000);
});
