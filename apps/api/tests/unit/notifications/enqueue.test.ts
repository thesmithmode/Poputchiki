import { describe, expect, it, vi } from "vitest";
import { enqueueNotification } from "../../../src/notifications/enqueue";

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
