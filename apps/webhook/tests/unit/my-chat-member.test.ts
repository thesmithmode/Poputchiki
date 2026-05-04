import { describe, expect, it, vi } from "vitest";
import { handleMyChatMember } from "../../src/handlers/my-chat-member";
import type { TelegramMyChatMember } from "../../src/types/telegram";

function makeEvent(status: string, fromId: number): TelegramMyChatMember {
  return {
    chat: { id: -100, type: "private" },
    from: { id: fromId, is_bot: false, first_name: "User" },
    old_chat_member: { status: "member", user: { id: 999, is_bot: true, first_name: "Bot" } },
    new_chat_member: {
      status: status as "kicked",
      user: { id: 999, is_bot: true, first_name: "Bot" },
    },
  };
}

describe("handleMyChatMember", () => {
  it("does nothing when status is not kicked", async () => {
    const sqlMock = vi.fn(() => Promise.resolve([]));
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("left", 123));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("updates notify_disabled when status is kicked", async () => {
    const sqlMock = vi.fn(() => Promise.resolve([]));
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("kicked", 456));
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("uses from.id in the WHERE clause", async () => {
    let capturedArgs: unknown[] = [];
    const sqlMock = vi.fn((...args: unknown[]) => {
      capturedArgs = args;
      return Promise.resolve([]);
    });
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("kicked", 789));
    expect(capturedArgs).toContain(789);
  });
});
