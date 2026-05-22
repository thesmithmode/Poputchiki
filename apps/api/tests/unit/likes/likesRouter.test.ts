import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLikesRouter } from "../../../src/likes/likesRouter";
import type { AppUser } from "../../../src/middleware/identity-guard";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
}));
vi.mock("../../../src/lib/db-errors", () => ({
  isUniqueViolation: vi.fn(),
}));

import { withIdentity } from "../../../src/db/with-identity";
import { isUniqueViolation } from "../../../src/lib/db-errors";
import { readJson } from "../../helpers/json";

const USER: AppUser = {
  id: "00000000-0000-4000-a000-000000000001",
  tgId: 1001,
  role: "user",
};

const TARGET_ID = "00000000-0000-4000-a000-000000000002";
const RIDE_ID = "00000000-0000-4000-a000-000000000003";
const LIKE_ID = "00000000-0000-4000-a000-000000000004";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
mockTx.json = (v: unknown) => JSON.stringify(v);
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;
mockSql.json = (v: unknown) => JSON.stringify(v);

function mockWithIdentityCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/likes/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
    app.use("/likes", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/likes", createLikesRouter(mockSql));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isUniqueViolation).mockReturnValue(false);
});

describe("POST /likes", () => {
  it("valid like (confirmed participation) → 201", async () => {
    const likeRow = {
      id: LIKE_ID,
      subject_id: USER.id,
      target_id: TARGET_ID,
      ride_id: RIDE_ID,
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    // First tx call: confirmed SELECT → [{ok:true}]; second tx call: INSERT → [likeRow]
    mockTx
      .mockResolvedValueOnce([{ ok: true }]) // confirmed check
      .mockResolvedValueOnce([likeRow]); // INSERT likes

    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe(LIKE_ID);
    expect(body.subject_id).toBe(USER.id);
  });

  it("on success → emits like_received via enqueueNotification (INSERT user_notifications + pg_notify)", async () => {
    const likeRow = {
      id: LIKE_ID,
      subject_id: USER.id,
      target_id: TARGET_ID,
      ride_id: RIDE_ID,
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx
      .mockResolvedValueOnce([{ ok: true }]) // confirmed check
      .mockResolvedValueOnce([likeRow]); // INSERT likes
    // enqueueNotification fire-and-forget: INSERT user_notifications + pg_notify
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(201);
    // Allow fire-and-forget enqueueNotification microtasks to flush
    await new Promise((r) => setTimeout(r, 0));

    // calls: [0]=COUNT throttle, [1]=INSERT, [2]=pg_notify
    expect(mockSql).toHaveBeenCalledTimes(3);
    const insertCall = mockSql.mock.calls[1];
    expect(insertCall[1]).toBe(TARGET_ID); // userId (liked user)
    expect(insertCall[2]).toBe("like_received");
    expect(insertCall[3]).toBe(RIDE_ID);
    const notifyCall = mockSql.mock.calls[2];
    const payload = JSON.parse(notifyCall[1] as string);
    expect(payload.category).toBe("like_received");
    expect(payload.user_id).toBe(TARGET_ID);
    expect(payload.ride_id).toBe(RIDE_ID);
    expect(payload.from_user_id).toBe(USER.id);
    expect(payload.like_id).toBe(LIKE_ID);
  });

  it("not confirmed → 403", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]); // confirmed SELECT returns empty

    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("not_confirmed");
  });

  it("missing ride_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("missing target_user_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid ride_id uuid → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: "not-uuid", target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid target_user_id uuid → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: "not-uuid" }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });

  it("target_user_id === own id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: USER.id }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("cannot like self");
  });

  it("already liked → 409", async () => {
    vi.mocked(isUniqueViolation).mockReturnValue(true);
    vi.mocked(withIdentity).mockRejectedValueOnce(new Error("unique"));

    const app = makeApp(USER);
    const res = await app.request("/likes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_user_id: TARGET_ID }),
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_liked");
  });
});

describe("DELETE /likes/:id", () => {
  it("valid delete within window → 204", async () => {
    mockWithIdentityCallThrough();
    // found row with recent created_at; then DELETE
    mockTx
      .mockResolvedValueOnce([{ created_at: new Date() }]) // SELECT found
      .mockResolvedValueOnce([]); // DELETE

    const app = makeApp(USER);
    const res = await app.request(`/likes/${LIKE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("like expired (>24h) → 410", async () => {
    mockWithIdentityCallThrough();
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    mockTx.mockResolvedValueOnce([{ created_at: oldDate }]); // found but old

    const app = makeApp(USER);
    const res = await app.request(`/likes/${LIKE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(410);
    const body = await readJson(res);
    expect(body.error).toBe("delete_window_expired");
  });

  it("invalid uuid id → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/likes/bad-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("not found → 404", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]); // SELECT found returns empty

    const app = makeApp(USER);
    const res = await app.request(`/likes/${LIKE_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });
});
