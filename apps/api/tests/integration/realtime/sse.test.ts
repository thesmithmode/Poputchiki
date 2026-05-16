import { randomUUID } from "node:crypto";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createListenSql, createPool } from "../../../src/db/pool";
import { withSystem } from "../../../src/db/with-identity";
import { identityGuard } from "../../../src/middleware/identity-guard";
import { createDispatcher } from "../../../src/realtime/dispatcher";
import { createRealtimeRouter } from "../../../src/realtime/realtimeRouter";
import { createRidesRouter } from "../../../src/rides/ridesRouter";
/**
 * Integration tests: GET /api/realtime/rides — SSE endpoint.
 * Requires: Postgres + migrations applied.
 * Uses Node http.createServer (real HTTP) so stream.onAbort fires → finally block covered.
 */
import { sessBind } from "../../helpers/auth";
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
let mainServer: http.Server;
let mainBaseUrl: string;

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
    Cookie: `sess_bind=${sessBind(JWT_SECRET, token)}`,
  };
}

async function buildHonoApp(heartbeatMs = 15000) {
  const dispatcher = await createDispatcher(createListenSql(buildDsn()), "rides_changed");
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    c.set("socketIp" as never, TEST_IP);
    await next();
  });
  app.use("/api/*", identityGuard(JWT_SECRET));
  app.route("/api/realtime", createRealtimeRouter(dispatcher, { heartbeatMs }));
  app.route("/api/rides", createRidesRouter(sql));
  return app;
}

/** Start a Node http.Server wrapping a Hono app; returns {server, baseUrl}. */
function startServer(app: Hono): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = `http://localhost${req.url}`;
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers[k] = v;
        else if (Array.isArray(v)) headers[k] = v.join(", ");
      }

      // Read body for non-GET/HEAD
      let bodyInit: Buffer | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        if (chunks.length > 0) bodyInit = Buffer.concat(chunks);
      }

      // Wire AbortController to client disconnect → Hono stream.onAbort fires
      // req "close" fires on TCP close (client disconnect), before res.end()
      const abortCtrl = new AbortController();
      req.on("close", () => abortCtrl.abort());

      const request = new Request(url, {
        method: req.method ?? "GET",
        headers,
        body: bodyInit,
        signal: abortCtrl.signal,
      });

      let honoRes: Response;
      try {
        honoRes = await app.fetch(request);
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
        return;
      }

      res.writeHead(honoRes.status, Object.fromEntries(honoRes.headers.entries()));
      res.flushHeaders(); // отправить заголовки немедленно, не ждать первого chunk

      if (honoRes.body) {
        const reader = honoRes.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const canContinue = res.write(value);
            if (!canContinue) {
              // backpressure — wait for drain
              await new Promise<void>((r) => res.once("drain", r));
            }
          }
        } catch {
          // client disconnected
        } finally {
          reader.cancel().catch(() => {});
        }
      }
      res.end();
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
    server.once("error", reject);
  });
}

function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
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
 * Reads SSE events from a fetch Response stream.
 * Stops when `count` events collected OR timeout reached.
 * Calls controller.abort() on exit to close the SSE connection.
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
    controller?.abort();
    await reader.cancel().catch(() => {});
    // дать async chain: TCP close → req.on(close) → abortCtrl → Hono finally block
    await new Promise((r) => setTimeout(r, 100));
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

  const { server, baseUrl } = await startServer(await buildHonoApp());
  mainServer = server;
  mainBaseUrl = baseUrl;
});

afterEach(async () => {
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE ${`ip:${TEST_IP}%`} OR key LIKE ${`user:${DRIVER.id}%`}`;
});

afterAll(async () => {
  await stopServer(mainServer);
  await sql`DELETE FROM audit_log WHERE user_id = ${DRIVER.id}`;
  await sql`DELETE FROM rides WHERE driver_id = ${DRIVER.id}`;
  await sql`DELETE FROM users WHERE id = ${DRIVER.id}`;
  await sql.end();
});

describe("GET /api/realtime/rides — SSE", () => {
  it("401 без авторизации", async () => {
    const res = await fetch(`${mainBaseUrl}/api/realtime/rides`);
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
    const res = await fetch(`${mainBaseUrl}/api/realtime/rides`, {
      headers,
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    controller.abort();
    await res.body?.cancel().catch(() => {});
    // дать async chain: TCP close → req.on(close) → abortCtrl → Hono finally block
    await new Promise((r) => setTimeout(r, 100));
  });

  it("heartbeat события приходят с заданным интервалом", async () => {
    const { server: srv, baseUrl: url } = await startServer(await buildHonoApp(150));
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

      // За 600ms при интервале 150ms ≥2 heartbeat
      const events = await collectSSEEvents(res, 2, 600, controller);
      const heartbeats = events.filter((e) => e.startsWith("heartbeat:"));
      expect(heartbeats.length).toBeGreaterThanOrEqual(2);
    } finally {
      await stopServer(srv);
    }
  }, 10_000);

  it("ride_changed приходит после создания поездки", async () => {
    const { server: srv, baseUrl: url } = await startServer(await buildHonoApp(5000));
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

      // Задержка чтобы LISTEN установился
      await new Promise((r) => setTimeout(r, 100));

      // Создаём поездку через основной сервер
      const createRes = await fetch(`${mainBaseUrl}/api/rides`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
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
      await stopServer(srv);
    }
  }, 10_000);

  it("ride_changed приходит после отмены поездки", async () => {
    const { server: srv, baseUrl: url } = await startServer(await buildHonoApp(5000));
    try {
      const authHeaders = await makeAuthHeaders({
        id: DRIVER.id,
        tgId: DRIVER.tgId,
        role: DRIVER.jwtRole,
      });

      // Создаём поездку
      const createRes = await fetch(`${mainBaseUrl}/api/rides`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
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

      // Задержка для LISTEN
      await new Promise((r) => setTimeout(r, 100));

      // Отменяем через основной сервер
      const cancelRes = await fetch(`${mainBaseUrl}/api/rides/${rideId}/cancel`, {
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
      await stopServer(srv);
    }
  }, 10_000);
});
