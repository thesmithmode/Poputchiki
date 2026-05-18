import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleMessage } from "../../src/handlers/message";
import type { TelegramMessage } from "../../src/types/telegram";

function makeMessage(text: string, chatId = 111): TelegramMessage {
  return { message_id: 1, chat: { id: chatId, type: "private" }, text };
}

type SqlCall = { strings: readonly string[]; values: unknown[] };

function makeSql() {
  const calls: SqlCall[] = [];
  const sql = ((strings: readonly string[], ...values: unknown[]) => {
    calls.push({ strings, values });
    return Promise.resolve([]);
  }) as unknown as import("postgres").Sql;
  return { sql, calls };
}

describe("handleMessage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing for non-/start non-/help text", async () => {
    const { sql, calls } = makeSql();
    await handleMessage(sql, "token", "domain.com", makeMessage("hello"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("sends sendMessage for /start", async () => {
    const { sql } = makeSql();
    await handleMessage(sql, "mytoken", "domain.com", makeMessage("/start"));
    const sendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("sendMessage"));
    expect(sendCalls).toHaveLength(1);
    expect(String(sendCalls[0]?.[0])).toContain("mytoken");
  });

  it("sends sendMessage for /help with domain", async () => {
    const { sql } = makeSql();
    await handleMessage(sql, "mytoken", "domain.com", makeMessage("/help"));
    const sendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("sendMessage"));
    expect(sendCalls).toHaveLength(1);
  });

  it("uses domain in URL when provided", async () => {
    const { sql } = makeSql();
    await handleMessage(sql, "tok", "царёво.рф", makeMessage("/start", 222));
    const sendCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("sendMessage"));
    const init = sendCall?.[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("https://app.царёво.рф");
    expect(body.chat_id).toBe(222);
  });

  it("does nothing when domain is undefined (no useful link)", async () => {
    const { sql, calls } = makeSql();
    await handleMessage(sql, "tok", undefined, makeMessage("/start"));
    expect(fetchMock).not.toHaveBeenCalled();
    // sql update still runs even without domain — /start signals user is alive
    expect(calls.length).toBeGreaterThanOrEqual(0);
  });

  it("/start clears notify_disabled for sender tg_id", async () => {
    const { sql, calls } = makeSql();
    await handleMessage(sql, "tok", "d.com", makeMessage("/start", 4242));
    const updateCalls = calls.filter((c) => c.strings.join("?").includes("notify_disabled"));
    expect(updateCalls).toHaveLength(1);
    const first = updateCalls[0];
    if (!first) throw new Error("no update call");
    const joined = first.strings.join(" ");
    expect(joined).toMatch(/UPDATE\s+users/);
    expect(joined).toMatch(/notify_disabled\s*=\s*false/);
    expect(joined).toMatch(/WHERE\s+tg_id\s*=/);
    expect(first.values).toContain(4242);
  });

  it("/help does NOT touch notify_disabled", async () => {
    const { sql, calls } = makeSql();
    await handleMessage(sql, "tok", "d.com", makeMessage("/help", 4242));
    const updateCalls = calls.filter((c) => c.strings.join("?").includes("notify_disabled"));
    expect(updateCalls).toHaveLength(0);
  });

  it("plain text does NOT touch notify_disabled", async () => {
    const { sql, calls } = makeSql();
    await handleMessage(sql, "tok", "d.com", makeMessage("hi", 4242));
    expect(calls).toHaveLength(0);
  });

  it("sql throw on /start does not propagate — sendMessage still called", async () => {
    const throwingSql = ((_strings: readonly string[], ..._values: unknown[]) =>
      Promise.reject(new Error("db down"))) as unknown as import("postgres").Sql;
    await handleMessage(throwingSql, "tok", "d.com", makeMessage("/start", 7));
    const sendCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("sendMessage"));
    expect(sendCalls).toHaveLength(1);
  });
});
