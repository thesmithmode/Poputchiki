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

// Must mirror USER_TOGGLEABLE_CATEGORIES + system from shared (12 rows).
// Drift here will surface as the upsert mock-call count being off by N.
const PREFS_ROWS = [
  { category: "ride_request", enabled: true },
  { category: "ride_request_accepted", enabled: true },
  { category: "ride_request_rejected", enabled: true },
  { category: "ride_request_cancelled", enabled: true },
  { category: "ride_cancelled", enabled: true },
  { category: "confirm_participation", enabled: true },
  { category: "participation_request", enabled: true },
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

describe("GET /notifications/", () => {
  it("returns notifications array → 200", async () => {
    mockWithIdentityCallThrough();
    const rows = [
      {
        id: "11111111-1111-4111-a111-111111111111",
        category: "ride_request",
        ride_id: null,
        data: { foo: "bar" },
        is_read: false,
        created_at: "2026-05-18T00:00:00Z",
      },
    ];
    mockTx.mockResolvedValueOnce(rows);

    const app = makeApp(USER);
    const res = await app.request("/notifications");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.notifications).toEqual(rows);
  });

  it("empty result → 200 + empty array", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/notifications");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.notifications).toEqual([]);
  });
});

describe("POST /notifications/read-all", () => {
  it("marks all unread → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ ok: true });
  });

  it("nothing unread → still 200 (idempotent)", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/notifications/read-all", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("POST /notifications/:id/read", () => {
  const NOTIF_ID = "11111111-1111-4111-a111-111111111111";

  it("valid uuid + own notification → 200 + invokes UPDATE", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([{ id: NOTIF_ID }]); // UPDATE RETURNING

    const app = makeApp(USER);
    const res = await app.request(`/notifications/${NOTIF_ID}/read`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ ok: true });
  });

  it("uuid not owned by user → 404", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]); // RLS hides row → 0 rows updated

    const app = makeApp(USER);
    const res = await app.request(`/notifications/${NOTIF_ID}/read`, { method: "POST" });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("invalid uuid → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/notifications/not-a-uuid/read", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("idempotent: already-read notification still → 200", async () => {
    mockWithIdentityCallThrough();
    // UPDATE ... WHERE id=:id AND user_id=:user RETURNING id — even when is_read was already true,
    // RETURNING still yields the row → endpoint reports ok.
    mockTx.mockResolvedValueOnce([{ id: NOTIF_ID }]);

    const app = makeApp(USER);
    const res = await app.request(`/notifications/${NOTIF_ID}/read`, { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("GET /notifications/preferences", () => {
  it("returns preferences → 200", async () => {
    mockWithIdentityCallThrough();
    // upsertDefaults calls tx 12 times (one per PREF_CATEGORIES entry),
    // then readPrefs calls tx once. Last call is SELECT → return PREFS_ROWS.
    for (let i = 0; i < 12; i++) mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce(PREFS_ROWS);

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
    // upserts × 12 (USER_TOGGLEABLE_CATEGORIES + system), then UPDATE × 1, then readPrefs SELECT
    for (let i = 0; i < 12; i++) mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([]); // UPDATE for ride_request
    mockTx.mockResolvedValueOnce([
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
    // upserts × 12, no updates, readPrefs SELECT
    for (let i = 0; i < 12; i++) mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce(PREFS_ROWS);

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
    for (let i = 0; i < 12; i++) mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce(PREFS_ROWS);

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
    // upserts × 12 + UPDATE × 2 = 14 tx calls before readPrefs
    mockTx.mockResolvedValue([]);
    const updatedPrefs = PREFS_ROWS.map((r) =>
      r.category === "like_received" || r.category === "review_received"
        ? { ...r, enabled: false }
        : r,
    );
    vi.mocked(withIdentity).mockImplementationOnce(async (_sql, _user, fn) => {
      let callCount = 0;
      const countingTx = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 14) return Promise.resolve([]);
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
