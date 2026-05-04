import { describe, it, expect, mock } from "bun:test";
import { handleMyChatMember } from "../src/handlers/my-chat-member";
import type { TelegramMyChatMember } from "../src/types/telegram";

function makeSql(querySpy: ReturnType<typeof mock>) {
  const tag = mock((..._args: unknown[]) => Promise.resolve([]));
  const sql = new Proxy(tag, {
    get: (t, p) => (p === "then" ? undefined : t[p as keyof typeof t]),
    apply: (t, thisArg, args) => t.apply(thisArg, args),
  });
  Object.assign(sql, querySpy);
  return querySpy as unknown as import("postgres").Sql;
}

function makeEvent(status: string, fromId: number): TelegramMyChatMember {
  return {
    chat: { id: -100, type: "private" },
    from: { id: fromId, is_bot: false, first_name: "User" },
    old_chat_member: { status: "member", user: { id: 999, is_bot: true, first_name: "Bot" } },
    new_chat_member: { status: status as "kicked", user: { id: 999, is_bot: true, first_name: "Bot" } },
  };
}

describe("handleMyChatMember", () => {
  it("does nothing when status is not kicked", async () => {
    const sqlMock = mock(() => Promise.resolve([]));
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("left", 123));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("updates notify_disabled when status is kicked", async () => {
    const sqlMock = mock(() => Promise.resolve([]));
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("kicked", 456));
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("uses from.id in the WHERE clause", async () => {
    let capturedArgs: unknown[] = [];
    const sqlMock = mock((...args: unknown[]) => {
      capturedArgs = args;
      return Promise.resolve([]);
    });
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makeEvent("kicked", 789));
    expect(capturedArgs).toContain(789);
  });
});
