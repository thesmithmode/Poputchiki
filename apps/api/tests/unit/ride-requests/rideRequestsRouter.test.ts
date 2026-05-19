import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "../../../src/middleware/identity-guard";
import { createRideRequestsRouter } from "../../../src/ride-requests/rideRequestsRouter";

vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
}));

import { withIdentity } from "../../../src/db/with-identity";
import { readJson } from "../../helpers/json";

const DRIVER: AppUser = {
  id: "00000000-0000-4000-a000-000000000001",
  tgId: 11,
  role: "user",
};
const PASSENGER: AppUser = {
  id: "00000000-0000-4000-a000-000000000002",
  tgId: 22,
  role: "user",
};
const STRANGER: AppUser = {
  id: "00000000-0000-4000-a000-000000000099",
  tgId: 99,
  role: "user",
};

const REQ_ID = "00000000-0000-4000-a000-000000000777";
const RIDE_ID = "00000000-0000-4000-a000-000000000333";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

function mockCallThrough() {
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
}

function makeApp(user: AppUser) {
  const app = new Hono();
  app.use("/ride-requests/*", async (c, next) => {
    c.set("user" as never, user);
    await next();
  });
  app.route("/ride-requests", createRideRequestsRouter(mockSql));
  return app;
}

const PENDING_ROW = {
  id: REQ_ID,
  ride_id: RIDE_ID,
  passenger_id: PASSENGER.id,
  driver_id: DRIVER.id,
  status: "pending",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockReset();
  vi.mocked(withIdentity).mockReset();
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

describe("POST /ride-requests/:id/accept", () => {
  it("400 — invalid uuid", async () => {
    const res = await makeApp(DRIVER).request("/ride-requests/bad/accept", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("404 — request not found", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([]);
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("403 — not driver", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]);
    const res = await makeApp(STRANGER).request(`/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("409 — status not pending", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ ...PENDING_ROW, status: "accepted" }]);
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("200 — driver accepts pending → status=accepted, seat забронирован (book_seat)", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]); // SELECT
    mockTx.mockResolvedValueOnce([]); // advisory lock
    mockTx.mockResolvedValueOnce([{ id: REQ_ID }]); // UPDATE
    mockTx.mockResolvedValueOnce([{ id: RIDE_ID }]); // book_seat
    mockTx.mockResolvedValueOnce([{ display_name: "Иван" }]); // SELECT display_name
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("accepted");
    expect(body.seat_refunded).toBe(false);
  });

  it("409 — accept когда book_seat вернул 0 rows (нет мест)", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]); // SELECT
    mockTx.mockResolvedValueOnce([]); // advisory lock
    mockTx.mockResolvedValueOnce([{ id: REQ_ID }]); // UPDATE
    mockTx.mockResolvedValueOnce([]); // book_seat → 0 rows
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/accept`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /ride-requests/:id/reject", () => {
  it("200 — driver rejects pending → status=rejected, место не возвращается (не было забронировано)", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]); // SELECT
    mockTx.mockResolvedValueOnce([]); // advisory lock
    mockTx.mockResolvedValueOnce([{ id: REQ_ID }]); // UPDATE
    mockTx.mockResolvedValueOnce([{ display_name: "Иван" }]); // SELECT display_name
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/reject`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("rejected");
    expect(body.seat_refunded).toBe(false);
  });

  it("403 — passenger пытается reject", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]);
    const res = await makeApp(PASSENGER).request(`/ride-requests/${REQ_ID}/reject`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("409 — reject already rejected", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ ...PENDING_ROW, status: "rejected" }]);
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/reject`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });
});

describe("POST /ride-requests/:id/cancel", () => {
  it("200 — passenger cancels pending → cancelled, место не возвращается (не было забронировано)", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]);
    mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([{ id: REQ_ID }]);
    mockTx.mockResolvedValueOnce([{ display_name: "Мария" }]); // SELECT display_name
    const res = await makeApp(PASSENGER).request(`/ride-requests/${REQ_ID}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("cancelled");
    expect(body.seat_refunded).toBe(false);
  });

  it("200 — passenger cancels accepted → cancelled + refund", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ ...PENDING_ROW, status: "accepted" }]);
    mockTx.mockResolvedValueOnce([]);
    mockTx.mockResolvedValueOnce([{ id: REQ_ID }]);
    mockTx.mockResolvedValueOnce([{ id: RIDE_ID }]); // unbook_seat
    mockTx.mockResolvedValueOnce([{ display_name: "Мария" }]); // SELECT display_name
    const res = await makeApp(PASSENGER).request(`/ride-requests/${REQ_ID}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("cancelled");
  });

  it("403 — driver пытается cancel", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([PENDING_ROW]);
    const res = await makeApp(DRIVER).request(`/ride-requests/${REQ_ID}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(403);
  });

  it("409 — cancel уже cancelled", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ ...PENDING_ROW, status: "cancelled" }]);
    const res = await makeApp(PASSENGER).request(`/ride-requests/${REQ_ID}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("409 — cancel уже rejected", async () => {
    mockCallThrough();
    mockTx.mockResolvedValueOnce([{ ...PENDING_ROW, status: "rejected" }]);
    const res = await makeApp(PASSENGER).request(`/ride-requests/${REQ_ID}/cancel`, {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });
});
