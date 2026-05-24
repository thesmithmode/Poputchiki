import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInternalTemplateSubscriptionsRouter } from "../../../src/template-subscriptions/internalTemplateSubscriptionsRouter";
import { readJson } from "../../helpers/json";

vi.mock("../../../src/template-subscriptions/respond", () => ({
  respondToSubscription: vi.fn(),
  isDomainError: (e: unknown): e is { code: string; message: string } =>
    typeof e === "object" && e !== null && "code" in e,
}));

import { respondToSubscription } from "../../../src/template-subscriptions/respond";

const SECRET = "shared-secret";
const SUB_ID = "00000000-0000-4000-a000-000000000888";
const TG_ID = 5678;
const USER_ID = "00000000-0000-4000-a000-000000000001";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function makeApp() {
  const app = new Hono();
  app.route(
    "/internal/template-subscriptions",
    createInternalTemplateSubscriptionsRouter(mockSql, SECRET),
  );
  return app;
}

function post(path: string, body: unknown, secret = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-internal-secret"] = secret;
  return makeApp().request(`/internal/template-subscriptions${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockReset();
  mockSql.mockResolvedValue([{ id: USER_ID, role: "user" }]);
  vi.mocked(respondToSubscription).mockReset();
});

describe("internalTemplateSubscriptionsRouter — auth", () => {
  it("401 — no secret header", async () => {
    const res = await makeApp().request(`/internal/template-subscriptions/${SUB_ID}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tg_id: TG_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("401 — wrong secret", async () => {
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID }, "wrong");
    expect(res.status).toBe(401);
  });
});

describe("internalTemplateSubscriptionsRouter — input validation", () => {
  it("400 — invalid uuid", async () => {
    const res = await post("/bad-id/accept", { tg_id: TG_ID });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("400 — invalid json body", async () => {
    const res = await post(`/${SUB_ID}/accept`, "not-json");
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid body");
  });

  it("400 — tg_id missing", async () => {
    const res = await post(`/${SUB_ID}/accept`, {});
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("tg_id required");
  });

  it("400 — tg_id non-number", async () => {
    const res = await post(`/${SUB_ID}/accept`, { tg_id: "abc" });
    expect(res.status).toBe(400);
  });

  it("400 — tg_id not finite", async () => {
    const res = await post(`/${SUB_ID}/accept`, { tg_id: Number.POSITIVE_INFINITY });
    expect(res.status).toBe(400);
  });

  it("404 — user not found by tg_id", async () => {
    mockSql.mockResolvedValueOnce([]);
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("user_not_found");
  });
});

describe("internalTemplateSubscriptionsRouter — success", () => {
  it("accept → 200 + id + status", async () => {
    vi.mocked(respondToSubscription).mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape
      sub: { id: SUB_ID, status: "accepted" } as any,
      passengerId: "pass-id",
      destination: "ЖК Царёво",
    });
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ id: SUB_ID, status: "accepted" });
  });

  it("reject → 200 + status=rejected", async () => {
    vi.mocked(respondToSubscription).mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape
      sub: { id: SUB_ID, status: "rejected" } as any,
      passengerId: "pass-id",
      destination: "ЖК Царёво",
    });
    const res = await post(`/${SUB_ID}/reject`, { tg_id: TG_ID });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("rejected");
  });
});

describe("internalTemplateSubscriptionsRouter — domain errors", () => {
  it("NOT_FOUND → 404 not_found", async () => {
    vi.mocked(respondToSubscription).mockRejectedValueOnce({
      code: "NOT_FOUND",
      message: "not found",
    });
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("FORBIDDEN → 403", async () => {
    vi.mocked(respondToSubscription).mockRejectedValueOnce({
      code: "FORBIDDEN",
      message: "forbidden",
    });
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(body.error).toBe("forbidden");
  });

  it("INVALID_STATE → 409 invalid_state", async () => {
    vi.mocked(respondToSubscription).mockRejectedValueOnce({
      code: "INVALID_STATE",
      message: "already processed",
    });
    const res = await post(`/${SUB_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("invalid_state");
  });
});
