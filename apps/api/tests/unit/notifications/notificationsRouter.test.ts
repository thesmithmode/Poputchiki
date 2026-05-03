import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createNotificationsRouter } from "../../../src/notifications/notificationsRouter";

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

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/notifications/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/notifications", createNotificationsRouter(mockSql));
  return app;
}

const PREFS_ROWS = [
  { category: "ride_request", enabled: true },
  { category: "ride_cancelled", enabled: true },
  { category: "confirm_participation", enabled: true },
  { category: "like_received", enabled: true },
  { category: "review_received", enabled: true },
  { category: "favorite_new_ride", enabled: true },
  { category: "support_reply", enabled: true },
  { category: "system", enabled: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  // Default: mockTx resolves with [] for INSERT ON CONFLICT calls, then prefs rows for SELECT
  mockTx.mockResolvedValue([]);
});

// Helper: make withIdentity call the callback with mockTx and return its result
function mockWithIdentityCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

describe("GET /notifications/preferences", () => {
  it("returns preferences → 200", async () => {
    mockWithIdentityCallThrough();
    // upsertDefaults calls tx 8 times (one per category), then readPrefs calls tx once
    // We need the last call (readPrefs SELECT) to return prefs rows
    // mockTx resolves [] by default (INSERT ON CONFLICT DO NOTHING returns [])
    // Last call is SELECT → return PREFS_ROWS
    mockTx
      .mockResolvedValueOnce([]) // category 1 upsert
      .mockResolvedValueOnce([]) // category 2 upsert
      .mockResolvedValueOnce([]) // category 3 upsert
      .mockResolvedValueOnce([]) // category 4 upsert
      .mockResolvedValueOnce([]) // category 5 upsert
      .mockResolvedValueOnce([]) // category 6 upsert
      .mockResolvedValueOnce([]) // category 7 upsert
      .mockResolvedValueOnce([]) // category 8 upsert
      .mockResolvedValueOnce(PREFS_ROWS); // readPrefs SELECT

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.system).toBe(true);
    expect(body.ride_request).toBe(true);
  });

  it("empty prefs (no rows in DB) → 200 empty object", async () => {
    mockWithIdentityCallThrough();
    // all calls return []  — upserts + readPrefs returns no rows
    mockTx.mockResolvedValue([]);

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(typeof body).toBe("object");
  });
});

describe("PUT /notifications/preferences", () => {
  it("valid partial update → 200", async () => {
    mockWithIdentityCallThrough();
    // upserts × 8, then UPDATE × 1, then readPrefs SELECT
    mockTx
      .mockResolvedValueOnce([]) // upsert ×8
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]) // UPDATE for ride_request
      .mockResolvedValueOnce([
        ...PREFS_ROWS.map((r) => (r.category === "ride_request" ? { ...r, enabled: false } : r)),
      ]); // readPrefs

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_request: false }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.ride_request).toBe(false);
  });

  it("empty body (all optional) → 200", async () => {
    mockWithIdentityCallThrough();
    // upserts × 8, no updates, readPrefs SELECT
    mockTx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(PREFS_ROWS);

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.system).toBe(true);
  });

  it("system: false → 422 (cannot disable)", async () => {
    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: false }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("non-boolean value → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_request: "yes" }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body treated as empty object → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(PREFS_ROWS);

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    // non-JSON → body={} → all fields optional + system not false → passes validation
    expect(res.status).toBe(200);
  });

  it("multiple fields updated → 200", async () => {
    mockWithIdentityCallThrough();
    // upserts × 8 + UPDATE × 2 + readPrefs
    mockTx.mockResolvedValue([]);
    // override last call with prefs rows
    const updatedPrefs = PREFS_ROWS.map((r) =>
      r.category === "like_received" || r.category === "review_received"
        ? { ...r, enabled: false }
        : r,
    );
    // We just return [] for all except we need readPrefs to return something
    // Use a counter approach: resolve [] for first N, then updatedPrefs
    vi.mocked(withIdentity).mockImplementationOnce(async (_sql, _user, fn) => {
      let callCount = 0;
      const countingTx = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 10) return Promise.resolve([]);
        return Promise.resolve(updatedPrefs);
      });
      return fn(countingTx as never);
    });

    const app = makeApp(USER);
    const res = await app.request("/notifications/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ like_received: false, review_received: false }),
    });
    expect(res.status).toBe(200);
  });
});
