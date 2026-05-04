import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRidesRouter } from "../../../src/rides/ridesRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
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
