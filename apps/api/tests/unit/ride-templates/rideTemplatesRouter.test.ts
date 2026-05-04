import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRideTemplatesRouter } from "../../../src/ride-templates/rideTemplatesRouter";

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

const TMPL_ID = "00000000-0000-4000-a000-000000000777";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
mockTx.unsafe = vi.fn(() => "COLS_FRAGMENT");

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function mockCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/ride-templates/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/ride-templates", createRideTemplatesRouter(mockSql));
  return app;
}

const VALID = {
  from_label: "A",
  from_lat: 55.1,
  from_lng: 49.1,
  to_label: "B",
  to_lat: 55.2,
  to_lng: 49.2,
  departure_time: "08:30",
  weekdays: [1, 2, 3],
  seats_total: 3,
};

const ROW = {
  id: TMPL_ID,
  driver_id: USER.id,
  from_label: "A",
  from_lat: 55.1,
  from_lng: 49.1,
  to_label: "B",
  to_lat: 55.2,
  to_lng: 49.2,
  departure_time: "08:30",
  weekdays: [1, 2, 3],
  price_rub: null,
  seats_total: 3,
  comment: null,
  active_from: "2026-05-04",
  active_to: null,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockReset();
  vi.mocked(withIdentity).mockReset();
  mockTx.unsafe = vi.fn(() => "COLS_FRAGMENT");
});

describe("POST /ride-templates", () => {
  it("valid → 201", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([ROW]);
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(VALID),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe(TMPL_ID);
  });

  it("invalid weekdays > 6 → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, weekdays: [7] }),
    });
    expect(res.status).toBe(422);
  });

  it("empty weekdays → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, weekdays: [] }),
    });
    expect(res.status).toBe(422);
  });

  it("seats_total > 4 → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, seats_total: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("seats_total < 1 → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, seats_total: 0 }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid lat → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, from_lat: 91 }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid lng → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, to_lng: 181 }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid time → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, departure_time: "9:00" }),
    });
    expect(res.status).toBe(422);
  });

  it("comment too long → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID, comment: "x".repeat(201) }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(422);
  });

  it("with optional active_from + price_rub → 201", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([ROW]);
    const app = makeApp(USER);
    const res = await app.request("/ride-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID,
        active_from: "2026-06-01",
        active_to: "2026-12-01",
        price_rub: 250,
        comment: "ok",
      }),
    });
    expect(res.status).toBe(201);
  });
});

describe("GET /ride-templates/me", () => {
  it("list → 200", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([ROW]);
    const app = makeApp(USER);
    const res = await app.request("/ride-templates/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(TMPL_ID);
  });

  it("empty → 200 []", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([]);
    const app = makeApp(USER);
    const res = await app.request("/ride-templates/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual([]);
  });
});

describe("PATCH /ride-templates/:id", () => {
  it("invalid uuid → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates/bad-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "x" }),
    });
    expect(res.status).toBe(400);
  });

  it("empty body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(422);
  });

  it("not found → 404", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([]); // exists check returns nothing
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "new" }),
    });
    expect(res.status).toBe(404);
  });

  it("update all fields → 200", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ id: TMPL_ID }]); // exists
    for (let i = 0; i < 13; i++) mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([ROW]); // final SELECT

    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_label: "A2",
        from_lat: 56,
        from_lng: 50,
        to_label: "B2",
        to_lat: 57,
        to_lng: 51,
        departure_time: "09:00",
        weekdays: [0, 6],
        price_rub: 300,
        seats_total: 4,
        comment: "обн",
        active_to: "2027-01-01",
        is_active: true,
      }),
    });
    expect(res.status).toBe(200);
  });

  it("partial update (comment+price) → 200", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ id: TMPL_ID }]); // exists
    mockTx.mockResolvedValueOnce([]); // comment update
    mockTx.mockResolvedValueOnce([]); // price update
    mockTx.mockResolvedValueOnce([ROW]); // final SELECT

    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: "new", price_rub: 250 }),
    });
    expect(res.status).toBe(200);
  });

  it("set comment to null → 200", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ id: TMPL_ID }]);
    mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([ROW]);

    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: null }),
    });
    expect(res.status).toBe(200);
  });

  it("invalid weekdays in PATCH → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekdays: [9] }),
    });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /ride-templates/:id", () => {
  it("invalid uuid → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/ride-templates/bad-id", { method: "DELETE" });
    expect(res.status).toBe(400);
  });

  it("not found → 404", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([]);
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("ok → 204", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ id: TMPL_ID }]);
    const app = makeApp(USER);
    const res = await app.request(`/ride-templates/${TMPL_ID}`, { method: "DELETE" });
    expect(res.status).toBe(204);
  });
});
