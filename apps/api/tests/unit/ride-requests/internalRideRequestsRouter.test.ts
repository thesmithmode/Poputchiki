import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInternalRideRequestsRouter } from "../../../src/ride-requests/internalRideRequestsRouter";
import { readJson } from "../../helpers/json";

vi.mock("../../../src/ride-requests/respond", () => ({
  respondToRideRequest: vi.fn(),
  isDomainError: (e: unknown): e is { code: string; message: string } =>
    typeof e === "object" && e !== null && "code" in e,
}));

import { respondToRideRequest } from "../../../src/ride-requests/respond";

const SECRET = "shared-secret";
const REQ_ID = "00000000-0000-4000-a000-000000000777";
const TG_ID = 1234;
const USER_ID = "00000000-0000-4000-a000-000000000001";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function makeApp() {
  const app = new Hono();
  app.route("/internal/ride-requests", createInternalRideRequestsRouter(mockSql, SECRET));
  return app;
}

function post(path: string, body: unknown, secret = SECRET) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-internal-secret"] = secret;
  return makeApp().request(`/internal/ride-requests${path}`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSql.mockReset();
  mockSql.mockResolvedValue([{ id: USER_ID, role: "user" }]);
  vi.mocked(respondToRideRequest).mockReset();
});

describe("internalRideRequestsRouter — auth", () => {
  it("401 — no secret header", async () => {
    const res = await makeApp().request(`/internal/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tg_id: TG_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("401 — wrong secret", async () => {
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID }, "wrong");
    expect(res.status).toBe(401);
  });
});

describe("internalRideRequestsRouter — input validation", () => {
  it("400 — invalid uuid", async () => {
    const res = await post("/bad/accept", { tg_id: TG_ID });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid id");
  });

  it("400 — invalid json body", async () => {
    const res = await post(`/${REQ_ID}/accept`, "not-json");
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("invalid body");
  });

  it("400 — tg_id missing", async () => {
    const res = await post(`/${REQ_ID}/accept`, {});
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBe("tg_id required");
  });

  it("400 — tg_id non-number", async () => {
    const res = await post(`/${REQ_ID}/accept`, { tg_id: "abc" });
    expect(res.status).toBe(400);
  });

  it("400 — tg_id not finite", async () => {
    const res = await post(`/${REQ_ID}/accept`, { tg_id: Number.POSITIVE_INFINITY });
    expect(res.status).toBe(400);
  });

  it("404 — user not found by tg_id", async () => {
    mockSql.mockResolvedValueOnce([]);
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("user_not_found");
  });
});

describe("internalRideRequestsRouter — success", () => {
  it("accept → 200 + ok payload", async () => {
    vi.mocked(respondToRideRequest).mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape
      request: { id: REQ_ID, status: "accepted" } as any,
      refunded: false,
    });
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ id: REQ_ID, status: "accepted", seat_refunded: false });
  });

  it("reject → 200", async () => {
    vi.mocked(respondToRideRequest).mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape
      request: { id: REQ_ID, status: "rejected" } as any,
      refunded: true,
    });
    const res = await post(`/${REQ_ID}/reject`, { tg_id: TG_ID });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.seat_refunded).toBe(true);
  });

  it("cancel → 200", async () => {
    vi.mocked(respondToRideRequest).mockResolvedValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: minimal mock shape
      request: { id: REQ_ID, status: "cancelled" } as any,
      refunded: true,
    });
    const res = await post(`/${REQ_ID}/cancel`, { tg_id: TG_ID });
    expect(res.status).toBe(200);
  });
});

describe("internalRideRequestsRouter — domain errors", () => {
  it("NOT_FOUND → 404 not_found", async () => {
    vi.mocked(respondToRideRequest).mockRejectedValueOnce({
      code: "NOT_FOUND",
      message: "not found",
    });
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toBe("not_found");
  });

  it("FORBIDDEN → 403", async () => {
    vi.mocked(respondToRideRequest).mockRejectedValueOnce({
      code: "FORBIDDEN",
      message: "forbidden",
    });
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(403);
  });

  it("NO_SEATS → 409 no_seats", async () => {
    vi.mocked(respondToRideRequest).mockRejectedValueOnce({
      code: "NO_SEATS",
      message: "full",
    });
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("no_seats");
  });

  it("INVALID_STATE → 409 invalid_state", async () => {
    vi.mocked(respondToRideRequest).mockRejectedValueOnce({
      code: "INVALID_STATE",
      message: "already accepted",
    });
    const res = await post(`/${REQ_ID}/accept`, { tg_id: TG_ID });
    expect(res.status).toBe(409);
    const body = await readJson(res);
    expect(body.error).toBe("invalid_state");
    expect(body.message).toBe("already accepted");
  });
});
