import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createReviewsRouter } from "../../../src/reviews/reviewsRouter";

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
const REVIEW_ID = "00000000-0000-4000-a000-000000000004";

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
    app.use("/reviews/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
    app.use("/reviews", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/reviews", createReviewsRouter(mockSql));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isUniqueViolation).mockReturnValue(false);
});

describe("POST /reviews", () => {
  it("valid review → 201", async () => {
    const row = {
      id: REVIEW_ID,
      ride_id: RIDE_ID,
      subject_id: USER.id,
      target_id: TARGET_ID,
      stars: 5,
      text: null,
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx
      .mockResolvedValueOnce([{ ok: 1 }]) // confirmed check
      .mockResolvedValueOnce([row]); // INSERT reviews

    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 5 }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe(REVIEW_ID);
    expect(body.stars).toBe(5);
  });

  it("valid review with body text → 201", async () => {
    const row = {
      id: REVIEW_ID,
      ride_id: RIDE_ID,
      subject_id: USER.id,
      target_id: TARGET_ID,
      stars: 4,
      text: "Отлично",
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([{ ok: 1 }]).mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 4, body: "Отлично" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.text).toBe("Отлично");
  });

  it("on success → emits review_received via enqueueNotification (INSERT user_notifications + pg_notify, stars in payload)", async () => {
    const row = {
      id: REVIEW_ID,
      ride_id: RIDE_ID,
      subject_id: USER.id,
      target_id: TARGET_ID,
      stars: 5,
      text: null,
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx
      .mockResolvedValueOnce([{ ok: 1 }]) // confirmed check
      .mockResolvedValueOnce([row]); // INSERT reviews
    // enqueueNotification fire-and-forget: INSERT user_notifications + pg_notify
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 5 }),
    });
    expect(res.status).toBe(201);
    await new Promise((r) => setTimeout(r, 0));

    // calls: [0]=COUNT throttle, [1]=INSERT, [2]=pg_notify
    expect(mockSql).toHaveBeenCalledTimes(3);
    const insertCall = mockSql.mock.calls[1];
    expect(insertCall[1]).toBe(TARGET_ID); // userId (reviewed user)
    expect(insertCall[2]).toBe("review_received");
    expect(insertCall[3]).toBe(RIDE_ID);
    const notifyCall = mockSql.mock.calls[2];
    const payload = JSON.parse(notifyCall[1] as string);
    expect(payload.category).toBe("review_received");
    expect(payload.user_id).toBe(TARGET_ID);
    expect(payload.ride_id).toBe(RIDE_ID);
    expect(payload.from_user_id).toBe(USER.id);
    expect(payload.review_id).toBe(REVIEW_ID);
    expect(payload.stars).toBe(5);
  });

  it("not confirmed participation → 403", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]); // confirmed check returns empty

    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 3 }),
    });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("not_confirmed");
  });

  it("missing ride_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: TARGET_ID, stars: 5 }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("missing target_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, stars: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("stars out of range (0) → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 0 }),
    });
    expect(res.status).toBe(422);
  });

  it("stars out of range (6) → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 6 }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid ride_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: "not-uuid", target_id: TARGET_ID, stars: 5 }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });

  it("target_id === own id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: USER.id, stars: 5 }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("cannot review self");
  });

  it("already reviewed → 409", async () => {
    vi.mocked(isUniqueViolation).mockReturnValue(true);
    vi.mocked(withIdentity).mockRejectedValueOnce(new Error("unique"));

    const app = makeApp(USER);
    const res = await app.request("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ride_id: RIDE_ID, target_id: TARGET_ID, stars: 5 }),
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_reviewed");
  });
});

describe("GET /reviews", () => {
  it("valid driver_id → 200", async () => {
    const rows = [
      {
        id: REVIEW_ID,
        ride_id: RIDE_ID,
        subject_id: USER.id,
        target_id: TARGET_ID,
        stars: 5,
        text: null,
        created_at: new Date(),
      },
    ];
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce(rows);

    const app = makeApp(USER);
    const res = await app.request(`/reviews?driver_id=${TARGET_ID}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(REVIEW_ID);
  });

  it("missing driver_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews");
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid driver_id");
  });

  it("invalid driver_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/reviews?driver_id=not-uuid");
    expect(res.status).toBe(422);
  });

  it("with custom limit and offset → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/reviews?driver_id=${TARGET_ID}&limit=10&offset=5`);
    expect(res.status).toBe(200);
  });

  it("limit clamped to max 100 → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/reviews?driver_id=${TARGET_ID}&limit=999`);
    expect(res.status).toBe(200);
  });

  it("non-numeric limit uses default → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/reviews?driver_id=${TARGET_ID}&limit=abc`);
    expect(res.status).toBe(200);
  });

  it("negative offset clamped to 0 → 200", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/reviews?driver_id=${TARGET_ID}&offset=-5`);
    expect(res.status).toBe(200);
  });
});
