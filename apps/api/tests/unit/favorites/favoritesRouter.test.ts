import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFavoritesRouter } from "../../../src/favorites/favoritesRouter";
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

const OTHER_ID = "00000000-0000-4000-a000-000000000002";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

// Helper: make withIdentity call the callback with mockTx and return its result
function mockWithIdentityCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/favorites/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/favorites", createFavoritesRouter(mockSql));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isUniqueViolation).mockReturnValue(false);
});

describe("POST /favorites", () => {
  it("valid body → 201", async () => {
    const row = { user_id: USER.id, target_id: OTHER_ID, notify: false, created_at: new Date() };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: OTHER_ID }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.user_id).toBe(USER.id);
    expect(body.target_id).toBe(OTHER_ID);
  });

  it("missing target_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("invalid uuid target_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: "not-a-uuid" }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(422);
  });

  it("target_id === own id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: USER.id }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("cannot favorite self");
  });

  it("duplicate → 409", async () => {
    vi.mocked(isUniqueViolation).mockReturnValue(true);
    vi.mocked(withIdentity).mockRejectedValueOnce(new Error("unique violation"));

    const app = makeApp(USER);
    const res = await app.request("/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_id: OTHER_ID }),
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_favorited");
  });
});

describe("GET /favorites/me", () => {
  it("returns list → 200", async () => {
    const rows = [
      {
        target_id: OTHER_ID,
        notify: true,
        created_at: new Date(),
        display_name: "Иван",
        tg_username: null,
        avatar_url: null,
        likes_received_count: 3,
        avg_stars: 4.5,
        reviews_count: 2,
      },
    ];
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce(rows);

    const app = makeApp(USER);
    const res = await app.request("/favorites/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].target_id).toBe(OTHER_ID);
  });

  it("empty list → 200 []", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request("/favorites/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(0);
  });
});

describe("PATCH /favorites/:target_id", () => {
  it("valid update → 200", async () => {
    const row = { user_id: USER.id, target_id: OTHER_ID, notify: true };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: true }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.notify).toBe(true);
  });

  it("invalid uuid param → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites/bad-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: true }),
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("missing notify field → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });

  it("not found → 404", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notify: false }),
    });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });
});

describe("DELETE /favorites/:target_id", () => {
  it("valid delete → 204", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([{ user_id: USER.id }]);

    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(204);
  });

  it("invalid uuid param → 400", async () => {
    const app = makeApp(USER);
    const res = await app.request("/favorites/bad-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("not found → 404", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const app = makeApp(USER);
    const res = await app.request(`/favorites/${OTHER_ID}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });
});
