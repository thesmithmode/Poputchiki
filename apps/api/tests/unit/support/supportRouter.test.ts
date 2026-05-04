import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createSupportRouter } from "../../../src/support/supportRouter";

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

const ADMIN: AppUser = {
  id: "00000000-0000-4000-a000-000000000002",
  tgId: 1002,
  role: "admin",
};

const MSG_ID = "00000000-0000-4000-a000-000000000010";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// fire-and-forget sql mock: must be callable as tagged template AND have .catch
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function mockWithIdentityCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(userRouter: Hono, adminRouter: Hono, user: AppUser) {
  const app = new Hono();
  app.use("/*", async (c, next) => {
    c.set("user" as never, user);
    await next();
  });
  app.route("/support", userRouter);
  app.route("/support", adminRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  // sql is called directly for pg_notify fire-and-forget — needs .catch()
  mockSql.mockReturnValue({ catch: vi.fn() });
  // mockTx is called as tagged template for SQL — default resolves with []
  mockTx.mockResolvedValue([]);
});

describe("POST /support/messages", () => {
  it("valid message → 201", async () => {
    const row = {
      id: MSG_ID,
      user_id: USER.id,
      text: "Помогите",
      status: "open",
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Помогите" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.id).toBe(MSG_ID);
    expect(body.user_id).toBe(USER.id);
  });

  it("empty text → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("missing text → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
  });

  it("text too long → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "a".repeat(2001) }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });
});

describe("GET /support/messages/me", () => {
  it("returns own messages → 200", async () => {
    const rows = [
      {
        id: MSG_ID,
        user_id: USER.id,
        text: "help",
        status: "open",
        reply_text: null,
        replied_at: null,
        created_at: new Date(),
      },
    ];
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce(rows);

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(MSG_ID);
  });

  it("empty → 200 []", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages/me");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(0);
  });
});

describe("GET /support/messages (admin)", () => {
  it("admin without filter → 200", async () => {
    const rows = [
      {
        id: MSG_ID,
        user_id: USER.id,
        text: "x",
        status: "open",
        reply_text: null,
        created_at: new Date(),
      },
    ];
    mockWithIdentityCallThrough();
    // tx called twice: once for tx`` (empty fragment) inside the template, once for main query
    mockTx
      .mockResolvedValueOnce([]) // tx`` empty fragment
      .mockResolvedValueOnce(rows); // main SELECT

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request("/support/messages");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
  });

  it("admin with status filter → 200", async () => {
    mockWithIdentityCallThrough();
    // tx called twice: once for tx`WHERE status = ${status}` fragment, once for main SELECT
    mockTx
      .mockResolvedValueOnce([]) // WHERE fragment
      .mockResolvedValueOnce([]); // main SELECT

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request("/support/messages?status=open");
    expect(res.status).toBe(200);
  });

  it("non-admin → 403", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request("/support/messages");
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("forbidden");
  });
});

describe("POST /support/messages/:id/reply (admin)", () => {
  it("admin valid reply → 200", async () => {
    const row = {
      id: MSG_ID,
      user_id: USER.id,
      text: "help",
      status: "resolved",
      reply_text: "Ответ",
      replied_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request(`/support/messages/${MSG_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_text: "Ответ" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("resolved");
    expect(body.reply_text).toBe("Ответ");
  });

  it("non-admin → 403", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, USER);
    const res = await app.request(`/support/messages/${MSG_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_text: "x" }),
    });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("forbidden");
  });

  it("invalid uuid id → 400", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request("/support/messages/bad-id/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_text: "x" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("empty reply_text → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request(`/support/messages/${MSG_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_text: "" }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("non-JSON body → 422", async () => {
    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request(`/support/messages/${MSG_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });

  it("message not found → 404", async () => {
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([]);

    const { userRouter, adminRouter } = createSupportRouter(mockSql);
    const app = makeApp(userRouter, adminRouter, ADMIN);
    const res = await app.request(`/support/messages/${MSG_ID}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reply_text: "hi" }),
    });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });
});
