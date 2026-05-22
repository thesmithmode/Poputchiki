import { describe, expect, it, vi } from "vitest";
import { enqueueNotification, enqueueNotificationBatch } from "../src/notifications/enqueue";

// biome-ignore lint/suspicious/noExplicitAny: tagged-template sql mock
const mockSql = vi.fn() as any;

const USER_ID = "00000000-0000-4000-a000-000000000001";
const RIDE_ID = "aaaaaaaa-0000-4000-a000-000000000001";

describe("enqueueNotification", () => {
  it("inserts into user_notifications and pg_notify with canonical category", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "ride_request",
      rideId: RIDE_ID,
      data: { passenger_id: "p", passenger_name: "Антон" },
    });

    expect(mockSql).toHaveBeenCalledTimes(2);

    const insertStrings: string[] = mockSql.mock.calls[0][0];
    const insertJoined = insertStrings.join("|");
    expect(insertJoined).toContain("INSERT INTO user_notifications");

    const notifyStrings: string[] = mockSql.mock.calls[1][0];
    const notifyJoined = notifyStrings.join("|");
    expect(notifyJoined).toContain("pg_notify");
    expect(notifyJoined).toContain("notify_user");

    // payload is the second interpolation arg of pg_notify
    const payloadArg = mockSql.mock.calls[1][1];
    const parsed = JSON.parse(payloadArg as string);
    expect(parsed.category).toBe("ride_request");
    expect(parsed.user_id).toBe(USER_ID);
    expect(parsed.ride_id).toBe(RIDE_ID);
    expect(parsed.passenger_name).toBe("Антон");
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

    const payloadArg = mockSql.mock.calls[1][1];
    const parsed = JSON.parse(payloadArg as string);
    expect(parsed.ride_id).toBeUndefined();
    expect(parsed.message_id).toBe("m1");
  });

  it("INSERT happens before pg_notify (ordering preserves feed-then-push semantics)", async () => {
    mockSql.mockReset();
    const order: string[] = [];
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const joined = strings.join("");
      if (joined.includes("INSERT INTO user_notifications")) order.push("insert");
      else if (joined.includes("pg_notify")) order.push("notify");
      return Promise.resolve([]);
    });

    await enqueueNotification(mockSql, {
      userId: USER_ID,
      category: "like_received",
    });

    expect(order).toEqual(["insert", "notify"]);
  });
});

describe("enqueueNotificationBatch", () => {
  it("пустой массив — ноль вызовов sql", async () => {
    mockSql.mockReset();
    await enqueueNotificationBatch(mockSql, []);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("2 items → 1 INSERT + 2 pg_notify (итого 3 вызова)", async () => {
    mockSql.mockReset();
    mockSql.mockResolvedValue([]);

    const USER2 = "00000000-0000-4000-a000-000000000002";
    await enqueueNotificationBatch(mockSql, [
      { userId: USER_ID, category: "ride_request", rideId: RIDE_ID, data: { x: 1 } },
      { userId: USER2, category: "ride_cancelled" },
    ]);

    expect(mockSql).toHaveBeenCalledTimes(3);

    const insertStrings: string[] = mockSql.mock.calls[0][0];
    expect(insertStrings.join("")).toContain("INSERT INTO user_notifications");
    expect(insertStrings.join("")).toContain("unnest");

    const notify1: string[] = mockSql.mock.calls[1][0];
    expect(notify1.join("")).toContain("pg_notify");
    const payload1 = JSON.parse(mockSql.mock.calls[1][1] as string);
    expect(payload1.user_id).toBe(USER_ID);
    expect(payload1.category).toBe("ride_request");
    expect(payload1.ride_id).toBe(RIDE_ID);

    const notify2: string[] = mockSql.mock.calls[2][0];
    expect(notify2.join("")).toContain("pg_notify");
    const payload2 = JSON.parse(mockSql.mock.calls[2][1] as string);
    expect(payload2.user_id).toBe(USER2);
    expect(payload2.ride_id).toBeUndefined();
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

  it("INSERT происходит до pg_notify (feed-then-push семантика)", async () => {
    mockSql.mockReset();
    const order: string[] = [];
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const s = strings.join("");
      if (s.includes("INSERT INTO user_notifications")) order.push("insert");
      else if (s.includes("pg_notify")) order.push("notify");
      return Promise.resolve([]);
    });

    await enqueueNotificationBatch(mockSql, [{ userId: USER_ID, category: "like_received" }]);
    expect(order).toEqual(["insert", "notify"]);
  });
});
