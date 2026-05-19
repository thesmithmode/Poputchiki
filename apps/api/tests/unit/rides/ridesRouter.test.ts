import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
}));

vi.mock("../../../src/middleware/anti-bot", () => ({
  antiBot: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

import { withIdentity } from "../../../src/db/with-identity";
import { readJson } from "../../helpers/json";

const USER: AppUser = {
  id: "00000000-0000-4000-a000-000000000001",
  tgId: 1001,
  role: "user",
};

const VALID_BODY = {
  from_label: "Улица Пушкина",
  from_lat: 55.75,
  from_lng: 37.61,
  to_label: "Красная площадь",
  to_lat: 55.753,
  to_lng: 37.621,
  departure_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  seats_total: 2,
};

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/rides/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/rides", createRidesRouter(mockSql));
  return app;
}

describe("POST /rides — validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid body → 201", async () => {
    const mockRide = { id: "ride-uuid", driver_id: USER.id, ...VALID_BODY };
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(mockRide as any);
    mockSql.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe("ride-uuid");
  });

  it("on create → emits favorite_new_ride to each follower (favorites SELECT → enqueueNotification per row)", async () => {
    const FOLLOWER_A = "00000000-0000-4000-a000-0000000000aa";
    const FOLLOWER_B = "00000000-0000-4000-a000-0000000000bb";
    const RIDE_ID = "ride-uuid-fav";
    const mockRide = { id: RIDE_ID, driver_id: USER.id, ...VALID_BODY };
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(mockRide as any);
    // mockSql call sequence on success:
    //   [0] pg_notify('rides_changed', ...) — cache-bust broadcast
    //   [1] SELECT user_id FROM favorites WHERE target_id = ... AND notify = true
    //   [2] enqueueNotification A: INSERT user_notifications
    //   [3] enqueueNotification A: pg_notify('notify_user', ...)
    //   [4] enqueueNotification B: INSERT user_notifications
    //   [5] enqueueNotification B: pg_notify('notify_user', ...)
    mockSql
      .mockResolvedValueOnce([]) // [0] rides_changed pg_notify
      .mockResolvedValueOnce([{ user_id: FOLLOWER_A }, { user_id: FOLLOWER_B }]) // [1] favorites
      .mockResolvedValueOnce([]) // [2]
      .mockResolvedValueOnce([]) // [3]
      .mockResolvedValueOnce([]) // [4]
      .mockResolvedValueOnce([]); // [5]

    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockSql).toHaveBeenCalledTimes(6);
    // [2] follower A INSERT
    const insertA = mockSql.mock.calls[2];
    expect(insertA[1]).toBe(FOLLOWER_A);
    expect(insertA[2]).toBe("favorite_new_ride");
    expect(insertA[3]).toBe(RIDE_ID);
    // [3] follower A pg_notify payload
    const notifyA = JSON.parse(mockSql.mock.calls[3][1] as string);
    expect(notifyA.category).toBe("favorite_new_ride");
    expect(notifyA.user_id).toBe(FOLLOWER_A);
    expect(notifyA.ride_id).toBe(RIDE_ID);
    expect(notifyA.driver_id).toBe(USER.id);
    // [4] follower B INSERT
    const insertB = mockSql.mock.calls[4];
    expect(insertB[1]).toBe(FOLLOWER_B);
    expect(insertB[2]).toBe("favorite_new_ride");
    // [5] follower B pg_notify payload
    const notifyB = JSON.parse(mockSql.mock.calls[5][1] as string);
    expect(notifyB.user_id).toBe(FOLLOWER_B);
  });

  it("on create with no followers → no per-follower enqueueNotification calls (rides_changed + favorites SELECT only)", async () => {
    const mockRide = { id: "ride-uuid", driver_id: USER.id, ...VALID_BODY };
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(mockRide as any);
    mockSql
      .mockResolvedValueOnce([]) // [0] rides_changed pg_notify
      .mockResolvedValueOnce([]); // [1] favorites SELECT empty

    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));

    // rides_changed pg_notify + favorites SELECT = 2; no enqueueNotification follow-ups
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it("missing from_label → 422", async () => {
    const app = makeApp(USER);
    const { from_label: _, ...noLabel } = VALID_BODY;
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(noLabel),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("validation failed");
  });

  it("seats_total out of range → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, seats_total: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("negative seats_total → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, seats_total: 0 }),
    });
    expect(res.status).toBe(422);
  });

  it("departure_at in the past → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, departure_at: "2020-01-01T00:00:00.000Z" }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.details.fieldErrors.departure_at).toBeDefined();
  });

  it("departure_at > 30 days → 422", async () => {
    const app = makeApp(USER);
    const far = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString();
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, departure_at: far }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(422);
  });

  it("price_rub negative → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_BODY, price_rub: -100 }),
    });
    expect(res.status).toBe(422);
  });
});

describe("POST /rides — anti-bot", () => {
  const ADMIN: AppUser = { id: "00000000-0000-4000-a000-000000000002", tgId: 1002, role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("too_new ANTIBOT error → 403 { error: 'too_new' }", async () => {
    const err = Object.assign(new Error("anti-bot: new account"), {
      code: "ANTIBOT",
      antibot: "too_new",
    });
    vi.mocked(withIdentity).mockRejectedValueOnce(err);

    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("too_new");
  });

  it("unverified_daily_limit ANTIBOT error → 403 { error: 'unverified_daily_limit' }", async () => {
    const err = Object.assign(new Error("anti-bot: daily limit"), {
      code: "ANTIBOT",
      antibot: "unverified_daily_limit",
    });
    vi.mocked(withIdentity).mockRejectedValueOnce(err);

    const app = makeApp(USER);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("unverified_daily_limit");
  });

  it("admin не получает ANTIBOT 403 (withIdentity не бросает antibot для admin)", async () => {
    const mockRide = { id: "ride-uuid", driver_id: ADMIN.id, ...VALID_BODY };
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce(mockRide as any);
    mockSql.mockResolvedValueOnce([]);

    const app = makeApp(ADMIN);
    const res = await app.request("/rides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe("ride-uuid");
  });
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const DRIVER_UUID = "550e8400-e29b-41d4-a716-446655440001";

const MOCK_RIDE_DETAIL = {
  id: VALID_UUID,
  driver_id: DRIVER_UUID,
  from_label: "ЖК Царёво, д. 5",
  from_lat: 55.7558,
  from_lng: 37.6173,
  to_label: "ул. Баумана",
  to_lat: 55.7963,
  to_lng: 49.1093,
  departure_at: new Date(Date.now() + 3600000).toISOString(),
  price_rub: 150,
  seats_total: 3,
  seats_taken: 1,
  status: "active",
  comment: null,
  created_at: new Date().toISOString(),
  driver: {
    id: DRIVER_UUID,
    first_name: "Иван",
    last_name: "Иванов",
    tg_id: 9999,
    likes_received_count: 5,
    created_at: new Date().toISOString(),
  },
  passengers: [],
};

describe("GET /rides/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid UUID, ride found → 200 with driver and passengers", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce([MOCK_RIDE_DETAIL] as any);

    const app = makeApp(USER);
    const res = await app.request(`/rides/${VALID_UUID}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(VALID_UUID);
    expect(body.driver).toBeDefined();
    expect(body.driver.tg_id).toBe(9999);
    expect(Array.isArray(body.passengers)).toBe(true);
  });

  it("valid UUID, ride not found → 404", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: mock
    vi.mocked(withIdentity).mockResolvedValueOnce([] as any);

    const app = makeApp(USER);
    const res = await app.request(`/rides/${VALID_UUID}`);
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not found");
  });

  it("invalid UUID → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/rides/not-a-uuid");
    expect(res.status).toBe(422);
  });

  it("passengers included in response", async () => {
    const passenger = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      first_name: "Мария",
      last_name: null,
      tg_id: 8888,
      likes_received_count: 2,
    };
    vi.mocked(withIdentity).mockResolvedValueOnce([
      { ...MOCK_RIDE_DETAIL, passengers: [passenger] },
    ] as unknown as Awaited<ReturnType<typeof withIdentity>>);

    const app = makeApp(USER);
    const res = await app.request(`/rides/${VALID_UUID}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.passengers).toHaveLength(1);
    expect(body.passengers[0].tg_id).toBe(8888);
  });
});

const DRIVER: AppUser = { id: DRIVER_UUID, tgId: 2001, role: "user" };

describe("POST /rides/:id/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("водитель, активная поездка → 200 { id, status: 'completed' }", async () => {
    vi.mocked(withIdentity).mockResolvedValueOnce({
      rideId: VALID_UUID,
      affectedPassengers: [],
    } as unknown as Awaited<ReturnType<typeof withIdentity>>);
    // audit log + pg_notify (fire-and-forget)
    mockSql.mockResolvedValue([]);

    const app = makeApp(DRIVER);
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(VALID_UUID);
    expect(body.status).toBe("completed");
  });

  it("нет аутентификации → 401", async () => {
    const app = makeApp();
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("невалидный UUID → 400", async () => {
    const app = makeApp(DRIVER);
    const res = await app.request("/rides/not-a-uuid/complete", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("поездка не найдена → 404", async () => {
    vi.mocked(withIdentity).mockRejectedValueOnce(
      Object.assign(new Error("not_found"), { code: "NOT_FOUND" }),
    );
    const app = makeApp(DRIVER);
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("не водитель → 403", async () => {
    vi.mocked(withIdentity).mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), { code: "FORBIDDEN" }),
    );
    const app = makeApp(USER);
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("forbidden");
  });

  it("поездка не active → 409", async () => {
    vi.mocked(withIdentity).mockRejectedValueOnce(
      Object.assign(new Error("invalid_state"), { code: "INVALID_STATE" }),
    );
    const app = makeApp(DRIVER);
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("invalid_state");
  });

  it("уведомляет принятых пассажиров о завершении поездки", async () => {
    const PASSENGER_ID = "550e8400-e29b-41d4-a716-446655440099";
    vi.mocked(withIdentity).mockResolvedValueOnce({
      rideId: VALID_UUID,
      affectedPassengers: [PASSENGER_ID],
    } as unknown as Awaited<ReturnType<typeof withIdentity>>);
    mockSql.mockResolvedValue([]);

    const app = makeApp(DRIVER);
    const res = await app.request(`/rides/${VALID_UUID}/complete`, { method: "POST" });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 0));

    // audit_log INSERT + pg_notify + enqueueNotification (INSERT + pg_notify per passenger)
    // минимум 4 sql вызова
    expect(mockSql.mock.calls.length).toBeGreaterThanOrEqual(4);
    // категория ride_completed в enqueueNotification INSERT
    const insertCall = mockSql.mock.calls.find((call: unknown[]) => call[2] === "ride_completed");
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toBe(PASSENGER_ID);
  });
});
