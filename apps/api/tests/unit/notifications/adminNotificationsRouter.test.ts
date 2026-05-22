import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createAdminNotificationsRouter } from "../../../src/notifications/adminNotificationsRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withSystem: vi.fn(),
}));

import { withSystem } from "../../../src/db/with-identity";
import { readJson } from "../../helpers/json";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

const ADMIN: AppUser = { id: "00000000-0000-4000-a000-000000000001", tgId: 1, role: "admin" };
const USER: AppUser = { id: "00000000-0000-4000-a000-000000000002", tgId: 2, role: "user" };

function makeApp(user?: AppUser) {
  const app = new Hono();
  if (user) {
    app.use("*", async (c, next) => {
      c.set("user" as never, user);
      await next();
    });
  }
  app.route("/", createAdminNotificationsRouter(mockSql));
  return app;
}

function setupWithSystem(
  pending = "3",
  dead = "1",
  topCategories = [{ category: "ride_request", count: "2" }],
  oldestPending: string | null = "2026-05-23T10:00:00Z",
) {
  (withSystem as ReturnType<typeof vi.fn>).mockImplementation(
    async (_sql: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi
        .fn()
        .mockResolvedValueOnce([{ pending, dead }])
        .mockResolvedValueOnce(topCategories)
        .mockResolvedValueOnce([{ oldest_pending: oldestPending }]);
      return fn(tx);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /dlq", () => {
  it("returns DLQ stats for admin", async () => {
    setupWithSystem("5", "2", [{ category: "ride_request", count: "3" }], "2026-05-23T08:00:00Z");
    const res = await makeApp(ADMIN).request("/dlq");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.pending).toBe(5);
    expect(body.dead).toBe(2);
    expect(body.top_categories).toEqual([{ category: "ride_request", count: 3 }]);
    expect(body.oldest_pending).toBe("2026-05-23T08:00:00Z");
  });

  it("403 for non-admin", async () => {
    const res = await makeApp(USER).request("/dlq");
    expect(res.status).toBe(403);
  });

  it("403 when no user", async () => {
    const res = await makeApp().request("/dlq");
    expect(res.status).toBe(403);
  });

  it("null oldest_pending when queue empty", async () => {
    setupWithSystem("0", "0", [], null);
    const res = await makeApp(ADMIN).request("/dlq");
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.pending).toBe(0);
    expect(body.oldest_pending).toBeNull();
  });
});
