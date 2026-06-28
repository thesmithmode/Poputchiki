import { describe, expect, it, vi } from "vitest";
import { enqueueNotification, enqueueNotificationBatch } from "../src/notifications/enqueue";

// biome-ignore lint/suspicious/noExplicitAny: tagged-template sql mock
const mockSql = vi.fn() as any;
// postgres.js helper — оборачивает объект как jsonb parameter
mockSql.json = (v: unknown) => v;

const USER_ID = "00000000-0000-4000-a000-000000000001";
const RIDE_ID = "aaaaaaaa-0000-4000-a000-000000000001";

describe("enqueueNotification", () => {
  it("calls RLS-safe enqueue DB function with canonical category", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "ride_request",
      rideId: RIDE_ID,
      data: { passenger_id: "p", passenger_name: "Антон" },
    });

    expect(mockSql).toHaveBeenCalledTimes(1);

    const functionStrings: string[] = mockSql.mock.calls[0][0];
    expect(functionStrings.join("|")).toContain("app.enqueue_user_notification");
    expect(mockSql.mock.calls[0][1]).toBe(USER_ID);
    expect(mockSql.mock.calls[0][2]).toBe("ride_request");
    expect(mockSql.mock.calls[0][3]).toBe(RIDE_ID);
    expect(mockSql.mock.calls[0][4]).toEqual({ passenger_id: "p", passenger_name: "Антон" });
    expect(mockSql.mock.calls[0][5]).toBe(50);
  });

  it("rejects invalid category (would silently drop in notifier whitelist)", async () => {
    await expect(
      enqueueNotification(mockSql, {
        userId: USER_ID,
        // biome-ignore lint/suspicious/noExplicitAny: intentional bad category for runtime guard
        category: "notify_user" as any,
      }),
    ).rejects.toThrow(/invalid category/);
  });

  it("rejects empty userId", async () => {
    await expect(
      enqueueNotification(mockSql, {
        userId: "",
        category: "system",
      }),
    ).rejects.toThrow(/userId/);
  });

  it("omits ride_id when rideId is null/undefined", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "support_reply",
      data: { message_id: "m1" },
    });

    expect(mockSql.mock.calls[0][3]).toBeNull();
    expect(mockSql.mock.calls[0][4]).toEqual({ message_id: "m1" });
  });

  it("delegates feed-then-push ordering to the RLS-safe DB function", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([{ inserted: true }]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "like_received",
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    expect((mockSql.mock.calls[0][0] as string[]).join("")).toContain(
      "app.enqueue_user_notification",
    );
  });

  it("throttle: ride_request passes configured limit to DB function", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([{ inserted: false }]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "ride_request",
      data: { passenger_name: "X" },
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(mockSql.mock.calls[0][5]).toBe(50);
  });

  it("throttle: system категория без лимита — передаёт NULL limit", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([{ inserted: true }]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "system",
    });

    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(mockSql.mock.calls[0][5]).toBeNull();
  });
});

describe("enqueueNotificationBatch", () => {
  it("пустой массив — ноль вызовов sql", async () => {
    mockSql.mockReset();
    await enqueueNotificationBatch(mockSql, []);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("2 items → 2 RLS-safe DB function calls with per-item throttle limits", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([{ inserted: true }]);

    const USER2 = "00000000-0000-4000-a000-000000000002";
    await enqueueNotificationBatch(mockSql, [
      { userId: USER_ID, category: "ride_request", rideId: RIDE_ID, data: { x: 1 } },
      { userId: USER2, category: "ride_cancelled" },
    ]);

    expect(mockSql).toHaveBeenCalledTimes(2);

    const firstStrings: string[] = mockSql.mock.calls[0][0];
    expect(firstStrings.join("")).toContain("app.enqueue_user_notification");
    expect(mockSql.mock.calls[0][1]).toBe(USER_ID);
    expect(mockSql.mock.calls[0][2]).toBe("ride_request");
    expect(mockSql.mock.calls[0][3]).toBe(RIDE_ID);
    expect(mockSql.mock.calls[0][4]).toEqual({ x: 1 });
    expect(mockSql.mock.calls[0][5]).toBe(50);

    expect(mockSql.mock.calls[1][1]).toBe(USER2);
    expect(mockSql.mock.calls[1][2]).toBe("ride_cancelled");
    expect(mockSql.mock.calls[1][3]).toBeNull();
    expect(mockSql.mock.calls[1][5]).toBe(100);
  });

  it("невалидная category → throw до sql-вызова", async () => {
    mockSql.mockReset();
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: намеренно плохая category
      enqueueNotificationBatch(mockSql, [{ userId: USER_ID, category: "bad_cat" as any }]),
    ).rejects.toThrow(/invalid category/);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("пустой userId → throw до sql-вызова", async () => {
    mockSql.mockReset();
    await expect(
      enqueueNotificationBatch(mockSql, [{ userId: "", category: "system" }]),
    ).rejects.toThrow(/userId/);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("batch also uses DB function so throttle is not bypassed", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([{ inserted: true }]);

    await enqueueNotificationBatch(mockSql, [{ userId: USER_ID, category: "like_received" }]);

    expect(mockSql).toHaveBeenCalledTimes(1);
    expect((mockSql.mock.calls[0][0] as string[]).join("")).toContain(
      "app.enqueue_user_notification",
    );
    expect(mockSql.mock.calls[0][5]).toBe(100);
  });
});
