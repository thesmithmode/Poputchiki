import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  domainError,
  isDomainError,
  respondToSubscription,
} from "../../../src/template-subscriptions/respond";

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
const SUB_ID = "00000000-0000-4000-a000-000000000888";
const TEMPLATE_ID = "00000000-0000-4000-a000-000000000444";
const RIDE_ID = "00000000-0000-4000-a000-000000000555";

const PENDING_SUB = {
  id: SUB_ID,
  template_id: TEMPLATE_ID,
  passenger_id: PASSENGER.id,
  status: "pending",
  active_from: "2026-01-01",
  active_to: null as string | null,
  driver_id: DRIVER.id,
  to_label: "ЖК Царёво",
};

// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockTx = vi.fn() as any;
// biome-ignore lint/suspicious/noExplicitAny: mock tagged-template sql
const mockSql = vi.fn() as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockTx.mockReset();
  vi.mocked(withIdentity).mockReset();
  vi.mocked(withIdentity).mockImplementation(async (_sql, _user, fn) => fn(mockTx));
  mockSql.mockReset();
  mockSql.mockResolvedValue([]);
});

describe("respondToSubscription", () => {
  it("accept → status=accepted, passengerId и destination в результате", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_SUB]) // SELECT sub
      .mockResolvedValueOnce([]) // UPDATE
      .mockResolvedValueOnce([]); // SELECT rides (нет поездок)

    const result = await respondToSubscription(mockSql, DRIVER, SUB_ID, "accept");

    expect(result.sub.status).toBe("accepted");
    expect(result.passengerId).toBe(PASSENGER.id);
    expect(result.destination).toBe("ЖК Царёво");
  });

  it("accept → enqueueNotification с category=template_subscription_accepted", async () => {
    mockTx.mockResolvedValueOnce([PENDING_SUB]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await respondToSubscription(mockSql, DRIVER, SUB_ID, "accept");

    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({
        category: "template_subscription_accepted",
        data: expect.objectContaining({ subscription_id: SUB_ID, destination: "ЖК Царёво" }),
      }),
    );
  });

  it("accept с существующими поездками → INSERT ride_requests + book_seat", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_SUB]) // SELECT sub
      .mockResolvedValueOnce([]) // UPDATE
      .mockResolvedValueOnce([{ id: RIDE_ID }]) // SELECT rides
      .mockResolvedValueOnce([{ id: "req-new" }]) // INSERT ride_requests → inserted
      .mockResolvedValueOnce([]); // book_seat

    await respondToSubscription(mockSql, DRIVER, SUB_ID, "accept");

    // SELECT sub + UPDATE + SELECT rides + INSERT + book_seat = 5 вызовов
    expect(mockTx).toHaveBeenCalledTimes(5);
  });

  it("accept с поездкой, INSERT DO NOTHING → book_seat не вызывается", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_SUB]) // SELECT sub
      .mockResolvedValueOnce([]) // UPDATE
      .mockResolvedValueOnce([{ id: RIDE_ID }]) // SELECT rides
      .mockResolvedValueOnce([]); // INSERT DO NOTHING → inserted=[]

    await respondToSubscription(mockSql, DRIVER, SUB_ID, "accept");

    // SELECT sub + UPDATE + SELECT rides + INSERT = 4, без book_seat
    expect(mockTx).toHaveBeenCalledTimes(4);
  });

  it("reject → status=rejected, enqueueNotification с template_subscription_rejected", async () => {
    mockTx
      .mockResolvedValueOnce([PENDING_SUB]) // SELECT sub
      .mockResolvedValueOnce([]); // UPDATE

    const result = await respondToSubscription(mockSql, DRIVER, SUB_ID, "reject");

    expect(result.sub.status).toBe("rejected");
    expect(vi.mocked(enqueueNotification)).toHaveBeenCalledWith(
      mockSql,
      expect.objectContaining({ category: "template_subscription_rejected" }),
    );
  });

  it("NOT_FOUND → DomainError code=NOT_FOUND если sub не найдена", async () => {
    mockTx.mockResolvedValueOnce([]); // пустой массив = нет подписки

    await expect(respondToSubscription(mockSql, DRIVER, SUB_ID, "accept")).rejects.toSatisfy(
      (e: unknown) => isDomainError(e) && (e as { code: string }).code === "NOT_FOUND",
    );
  });

  it("FORBIDDEN → DomainError code=FORBIDDEN если user не является водителем", async () => {
    mockTx.mockResolvedValueOnce([{ ...PENDING_SUB, driver_id: "other-00000000-0000-4000" }]);

    await expect(respondToSubscription(mockSql, DRIVER, SUB_ID, "accept")).rejects.toSatisfy(
      (e: unknown) => isDomainError(e) && (e as { code: string }).code === "FORBIDDEN",
    );
  });

  it("INVALID_STATE → DomainError если sub.status !== pending", async () => {
    mockTx.mockResolvedValueOnce([{ ...PENDING_SUB, status: "accepted" }]);

    await expect(respondToSubscription(mockSql, DRIVER, SUB_ID, "accept")).rejects.toSatisfy(
      (e: unknown) => isDomainError(e) && (e as { code: string }).code === "INVALID_STATE",
    );
  });
});

describe("isDomainError", () => {
  it("обычная ошибка → false", () => {
    expect(isDomainError(new Error("plain"))).toBe(false);
    expect(isDomainError(null)).toBe(false);
    expect(isDomainError("string")).toBe(false);
  });

  it("domainError с корректным кодом → true", () => {
    expect(isDomainError(domainError("NOT_FOUND", "test"))).toBe(true);
    expect(isDomainError(domainError("FORBIDDEN", "test"))).toBe(true);
    expect(isDomainError(domainError("INVALID_STATE", "test"))).toBe(true);
  });
});
