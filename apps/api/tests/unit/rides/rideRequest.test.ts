import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
}));

import { withIdentity } from "../../../src/db/with-identity";
import { readJson } from "../../helpers/json";

const USER: AppUser = { id: "00000000-0000-4000-a000-000000000001", tgId: 1001, role: "user" };
const DRIVER_ID = "00000000-0000-4000-a000-000000000002";
const RIDE_ID = "aaaaaaaa-0000-4000-a000-000000000001";

// biome-ignore lint/suspicious/noExplicitAny: mock
const mockSql = vi.fn() as any;
mockSql.json = (v: unknown) => JSON.stringify(v);

function makeApp() {
  const app = new Hono();
  app.use("/rides/*", async (c, next) => {
    c.set("user" as never, USER);
    await next();
  });
  app.route("/rides", createRidesRouter(mockSql));
  return app;
}

describe("POST /rides/:id/request", () => {
  it("valid request → 201 with ride_request object", async () => {
    const mockRequest = {
      id: "req-uuid",
      ride_id: RIDE_ID,
      passenger_id: USER.id,
      status: "pending",
    };
    vi.mocked(withIdentity).mockResolvedValueOnce({
      rideRequest: mockRequest,
      driverId: DRIVER_ID,
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any);
    mockSql.mockResolvedValueOnce([]); // user_notifications INSERT fire-and-forget
    mockSql.mockResolvedValueOnce([]); // pg_notify fire-and-forget

    const app = makeApp();
    const res = await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe("req-uuid");
    expect(body.ride_id).toBe(RIDE_ID);
  });

  it("no seats available (read-only check) → 409 with error='no_seats'", async () => {
    const noSeatsErr = Object.assign(new Error("no_seats"), { code: "NO_SEATS" });
    vi.mocked(withIdentity).mockRejectedValueOnce(noSeatsErr);

    const app = makeApp();
    const res = await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("no_seats");
  });

  it("ride not found → 404 with error='not_found'", async () => {
    const notFoundErr = Object.assign(new Error("not_found"), { code: "NOT_FOUND" });
    vi.mocked(withIdentity).mockRejectedValueOnce(notFoundErr);

    const app = makeApp();
    const res = await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("driver requests own ride → 403 with error='own_ride'", async () => {
    const ownRideErr = Object.assign(new Error("own_ride"), { code: "OWN_RIDE" });
    vi.mocked(withIdentity).mockRejectedValueOnce(ownRideErr);

    const app = makeApp();
    const res = await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("own_ride");
  });

  it("already requested (unique violation 23505) → 409 with error='already_requested'", async () => {
    const uniqueErr = { code: "23505", message: "duplicate key" };
    vi.mocked(withIdentity).mockRejectedValueOnce(uniqueErr);

    const app = makeApp();
    const res = await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_requested");
  });

  it("invalid ride UUID → 400", async () => {
    const app = makeApp();
    const res = await app.request("/rides/not-a-uuid/request", { method: "POST" });

    expect(res.status).toBe(400);
  });

  it("no user in context → 401", async () => {
    const appNoUser = new Hono();
    appNoUser.route("/rides", createRidesRouter(mockSql));
    const res = await appNoUser.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    expect(res.status).toBe(401);
  });

  it("driver in-app notification uses category 'ride_request', not channel name", async () => {
    // Sentinel for regression: ridesRouter.ts previously inserted 'notify_user' (channel name)
    // as category value, which caused EventsScreen fallback to render the raw string.
    // After enqueueNotification migration, INSERT runs first, then pg_notify with
    // category as JSON payload value (not as SQL literal).
    const mockRequest = {
      id: "req-uuid",
      ride_id: RIDE_ID,
      passenger_id: USER.id,
      status: "pending",
    };
    vi.mocked(withIdentity).mockResolvedValueOnce({
      rideRequest: mockRequest,
      driverId: DRIVER_ID,
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any);
    mockSql.mockResolvedValueOnce([]); // user_notifications INSERT
    mockSql.mockResolvedValueOnce([]); // pg_notify

    const app = makeApp();
    await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    // First sql call is INSERT INTO user_notifications; category is an interpolated arg.
    const insertCall = mockSql.mock.calls[0];
    expect(insertCall).toBeDefined();
    const insertStrings: string[] = insertCall[0];
    const insertJoined = insertStrings.join("|");
    expect(insertJoined).toContain("INSERT INTO user_notifications");
    // category is the 2nd interpolation (after userId::uuid)
    expect(insertCall[2]).toBe("ride_request");
    expect(insertCall[2]).not.toBe("notify_user");

    // Second call is pg_notify with payload JSON; category must be 'ride_request' inside payload
    const notifyCall = mockSql.mock.calls[1];
    const payload = JSON.parse(notifyCall[1] as string);
    expect(payload.category).toBe("ride_request");
    expect(payload.category).not.toBe("notify_user");
  });

  it("withIdentity called with 'repeatable read' isolation", async () => {
    const mockRequest = {
      id: "req-uuid",
      ride_id: RIDE_ID,
      passenger_id: USER.id,
      status: "pending",
    };
    vi.mocked(withIdentity).mockResolvedValueOnce({
      rideRequest: mockRequest,
      driverId: DRIVER_ID,
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any);
    mockSql.mockResolvedValueOnce([]); // pg_notify
    mockSql.mockResolvedValueOnce([]); // user_notifications INSERT fire-and-forget

    const app = makeApp();
    await app.request(`/rides/${RIDE_ID}/request`, { method: "POST" });

    const callArgs = vi.mocked(withIdentity).mock.calls.at(-1);
    // 4th arg is isolation level
    expect(callArgs?.[3]).toBe("repeatable read");
  });
});
