import { describe, expect, it, vi } from "vitest";
import { handleMyChatMember } from "../../src/handlers/my-chat-member";
import type { TelegramMyChatMember } from "../../src/types/telegram";

// Mock sql: tagged-template fn + .begin(fn) → fn(sql) для RLS escalation pattern
function makeSqlMock() {
  const sqlMock = vi.fn(() => Promise.resolve([]));
  // biome-ignore lint/suspicious/noExplicitAny: mock postgres.Sql shape
  (sqlMock as any).begin = vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(sqlMock));
  return sqlMock;
}

function makePrivateEvent(status: string, chatId: number, fromId: number): TelegramMyChatMember {
  return {
    chat: { id: chatId, type: "private" },
    from: { id: fromId, is_bot: false, first_name: "User" },
    old_chat_member: { status: "member", user: { id: 999, is_bot: true, first_name: "Bot" } },
    new_chat_member: {
      status: status as "kicked",
      user: { id: 999, is_bot: true, first_name: "Bot" },
    },
  };
}

function makeGroupEvent(status: string, chatId: number, fromId: number): TelegramMyChatMember {
  return {
    chat: { id: chatId, type: "group" },
    from: { id: fromId, is_bot: false, first_name: "Admin" },
    old_chat_member: { status: "member", user: { id: 999, is_bot: true, first_name: "Bot" } },
    new_chat_member: {
      status: status as "kicked",
      user: { id: 999, is_bot: true, first_name: "Bot" },
    },
  };
}

describe("handleMyChatMember", () => {
  it("does nothing when status is not kicked", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makePrivateEvent("left", 456789, 123));
    expect(sqlMock).not.toHaveBeenCalled();
    // biome-ignore lint/suspicious/noExplicitAny: mock postgres.Sql shape
    expect((sqlMock as any).begin).not.toHaveBeenCalled();
  });

  it("updates notify_disabled when status is kicked (private chat)", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makePrivateEvent("kicked", 456789, 99999));
    // sql.begin вызван один раз; внутри SET LOCAL ROLE + UPDATE = 2 tagged calls
    // biome-ignore lint/suspicious/noExplicitAny: mock postgres.Sql shape
    expect((sqlMock as any).begin).toHaveBeenCalledTimes(1);
    expect(sqlMock).toHaveBeenCalledTimes(2);
  });

  it("REL-03: SET LOCAL ROLE poputchiki_service до UPDATE", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    await handleMyChatMember(sql, makePrivateEvent("kicked", 456789, 99999));
    // calls[i][0] = TemplateStringsArray; join сегменты для поиска подстроки
    const rawCalls = sqlMock.mock.calls as unknown as unknown[][];
    const calls = rawCalls.map((c) => {
      const tpl = c[0] as unknown as readonly string[];
      return tpl.join("?");
    });
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
    expect(calls[1]).toContain("UPDATE users SET notify_disabled");
  });

  // FIX A5: используем chat.id, не from.id; group-event игнорируется
  it("FIX A5: использует chat.id в WHERE (не from.id)", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    // from.id=99999 (инициатор), chat.id=456789 (пользователь, заблокировавший бота)
    await handleMyChatMember(sql, makePrivateEvent("kicked", 456789, 99999));
    // Собираем все args со всех вызовов
    const allArgs = sqlMock.mock.calls.flat();
    expect(allArgs).toContain(456789);
    expect(allArgs).not.toContain(99999);
  });

  it("FIX A5: group kick-event игнорируется (не private чат)", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    // kicked в group — не приватный чат, игнорируем
    await handleMyChatMember(sql, makeGroupEvent("kicked", -100500, 456789));
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("FIX A5: supergroup kick-event тоже игнорируется", async () => {
    const sqlMock = makeSqlMock();
    const sql = sqlMock as unknown as import("postgres").Sql;
    const supergroupEvent: TelegramMyChatMember = {
      chat: { id: -100500, type: "supergroup" },
      from: { id: 999, is_bot: false, first_name: "Admin" },
      old_chat_member: { status: "member", user: { id: 1, is_bot: true, first_name: "Bot" } },
      new_chat_member: { status: "kicked", user: { id: 1, is_bot: true, first_name: "Bot" } },
    };
    await handleMyChatMember(sql, supergroupEvent);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
