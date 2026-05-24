import { beforeEach, describe, expect, it, vi } from "vitest";
import { respondToRideRequest } from "../../../src/ride-requests/respond";

vi.mock("@poputchiki/shared", () => ({
  enqueueNotification: vi.fn().mockResolvedValue(undefined),
  isNotificationCategory: () => true,
}));
vi.mock("../../../src/db/with-identity", () => ({
  withIdentity: vi.fn(),
}));

import { enqueueNotification } from "@poputchiki/shared";
import { withIdentity } from "../../../src/db/with-identity";
import type { AppUser } from "../../../src/middleware/identity-guard";

const DRIVER: AppUser = { id: "00000000-0000-4000-a000-000000000001", tgId: 11, role: "user" };
const PASSENGER: AppUser = { id: "00000000-0000-4000-a000-000000000002", tgId: 22, role: "user" };
const REQ_ID = "00000000-0000-4000-a000-000000000777";
const RIDE_ID = "00000000-0000-4000-a000-000000000333";

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

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
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

describe("respondToRideRequest — уведомление содержит имя актора", () => {
  it("accept → enqueueNotification получает driver_name из display_name", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_ROW]) // SELECT ride_request
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([{ id: REQ_ID }]) // UPDATE
      .mockResolvedValueOnce([{ id: RIDE_ID }]) // book_seat
      .mockResolvedValueOnce([{ display_name: "Иван Водитель" }]); // SELECT display_name

    await respondToRideRequest(mockSql, DRIVER, REQ_ID, "accept");

    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({
        category: "ride_request_accepted",
        data: expect.objectContaining({ driver_name: "Иван Водитель" }),
      }),
    );
  });

  it("reject → enqueueNotification получает driver_name", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_ROW]) // SELECT ride_request
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([{ id: REQ_ID }]) // UPDATE
      .mockResolvedValueOnce([{ display_name: "Иван Водитель" }]); // SELECT display_name

    await respondToRideRequest(mockSql, DRIVER, REQ_ID, "reject");

    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({
        category: "ride_request_rejected",
        data: expect.objectContaining({ driver_name: "Иван Водитель" }),
      }),
    );
  });

  it("cancel → enqueueNotification получает passenger_name", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_ROW]) // SELECT ride_request
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([{ id: REQ_ID }]) // UPDATE
      .mockResolvedValueOnce([{ display_name: "Мария Пассажир" }]); // SELECT display_name

    await respondToRideRequest(mockSql, PASSENGER, REQ_ID, "cancel");

    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({
        category: "ride_request_cancelled",
        data: expect.objectContaining({ passenger_name: "Мария Пассажир" }),
      }),
    );
  });

  it("accept → pg_notify вызывается с ride_id для SSE-инвалидации", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_ROW]) // SELECT ride_request
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([{ id: REQ_ID }]) // UPDATE
      .mockResolvedValueOnce([{ id: RIDE_ID }]) // book_seat
      .mockResolvedValueOnce([{ display_name: "Иван" }]); // SELECT display_name

    await respondToRideRequest(mockSql, DRIVER, REQ_ID, "accept");

    // mockSql вызывается как tagged template: первый аргумент — массив строк шаблона
    const calls = mockSql.mock.calls as unknown[][];
    const notifyCall = calls.find((args) => {
      const parts = args[0];
      return Array.isArray(parts) && (parts as string[]).some((s) => s.includes("pg_notify"));
    });
    expect(notifyCall).toBeDefined();
    // Второй аргумент — JSON payload, должен содержать ride_id
    const payload = notifyCall?.[1] as string;
    expect(payload).toContain(RIDE_ID);
  });

  it("display_name пустой → пустая строка в data, не падает", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_ROW]) // SELECT ride_request
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([{ id: REQ_ID }]) // UPDATE
      .mockResolvedValueOnce([{ id: RIDE_ID }]) // book_seat
      .mockResolvedValueOnce([{ display_name: "" }]); // SELECT display_name (empty)

    await respondToRideRequest(mockSql, DRIVER, REQ_ID, "accept");

    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({
        data: expect.objectContaining({ driver_name: "" }),
      }),
    );
  });
});
