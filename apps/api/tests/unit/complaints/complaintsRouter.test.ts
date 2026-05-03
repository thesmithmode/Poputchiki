import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createComplaintsRouter } from "../../../src/complaints/complaintsRouter";
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

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function mockWithIdentityCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("/complaints/*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
    app.use("/complaints", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/complaints", createComplaintsRouter(mockSql));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isUniqueViolation).mockReturnValue(false);
});

describe("POST /complaints", () => {
  it("valid complaint without ride → 201", async () => {
    const row = {
      id: "00000000-0000-4000-a000-000000000099",
      reporter_id: USER.id,
      target_id: TARGET_ID,
      status: "open",
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: TARGET_ID, reason_code: "spam" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.reporter_id).toBe(USER.id);
    expect(body.status).toBe("open");
  });

  it("valid complaint with ride and text → 201", async () => {
    const row = {
      id: "00000000-0000-4000-a000-000000000099",
      reporter_id: USER.id,
      target_id: TARGET_ID,
      status: "open",
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_user_id: TARGET_ID,
        target_ride_id: RIDE_ID,
        reason_code: "fraud",
        text: "Не приехал",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("valid complaint with reason_code only (no text) → reason stored as code", async () => {
    const row = {
      id: "00000000-0000-4000-a000-000000000099",
      reporter_id: USER.id,
      target_id: TARGET_ID,
      status: "open",
      created_at: new Date(),
    };
    mockWithIdentityCallThrough();
    mockTx.mockResolvedValueOnce([row]);

    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: TARGET_ID, reason_code: "other" }),
    });
    expect(res.status).toBe(201);
  });

  it("missing target_user_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason_code: "spam" }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("invalid input");
  });

  it("invalid reason_code → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: TARGET_ID, reason_code: "bad_code" }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid uuid target_user_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "not-uuid", reason_code: "spam" }),
    });
    expect(res.status).toBe(422);
  });

  it("invalid uuid target_ride_id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_user_id: TARGET_ID,
        target_ride_id: "not-uuid",
        reason_code: "spam",
      }),
    });
    expect(res.status).toBe(422);
  });

  it("text too long → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_user_id: TARGET_ID,
        reason_code: "other",
        text: "x".repeat(1001),
      }),
    });
    expect(res.status).toBe(422);
  });

  it("non-JSON body → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "bad",
    });
    expect(res.status).toBe(422);
  });

  it("target_user_id === own id → 422", async () => {
    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: USER.id, reason_code: "spam" }),
    });
    expect(res.status).toBe(422);
    const body = await readJson(res);
    expect(body.error).toBe("cannot complain about self");
  });

  it("duplicate complaint → 409", async () => {
    vi.mocked(isUniqueViolation).mockReturnValue(true);
    vi.mocked(withIdentity).mockRejectedValueOnce(new Error("unique"));

    const app = makeApp(USER);
    const res = await app.request("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: TARGET_ID, reason_code: "offense" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("already_reported_this_week");
  });
});
