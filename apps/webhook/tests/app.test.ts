import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { createApp } from "../src/app";
import type { TelegramUpdate } from "../src/types/telegram";

const SECRET = "super-secret-token-xyz";
const BOT_TOKEN = "bot123token";

function makeSql() {
  return mock(() => Promise.resolve([])) as unknown as import("postgres").Sql;
}

function post(app: ReturnType<typeof createApp>, update: TelegramUpdate, secret?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== undefined) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  return app.request("/tg/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });
}

function baseUpdate(id = 1): TelegramUpdate {
  return { update_id: id };
}

describe("POST /tg/webhook", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof mock>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = mock(() => Promise.resolve(new Response("{}", { status: 200 })));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns 401 without secret header", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET);
    const res = await post(app, baseUpdate(), undefined);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong secret", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET);
    const res = await post(app, baseUpdate(), "wrong");
    expect(res.status).toBe(401);
  });

  it("returns 200 for deduplicated update", async () => {
    const sql = makeSql();
    const app = createApp(sql, BOT_TOKEN, SECRET);
    const update = baseUpdate(99);
    await post(app, update, SECRET);
    const res2 = await post(app, update, SECRET);
    expect(res2.status).toBe(200);
    expect((sql as unknown as ReturnType<typeof mock>).mock.calls.length).toBe(0);
  });

  it("handles my_chat_member kicked and returns 200", async () => {
    const sql = makeSql();
    const app = createApp(sql, BOT_TOKEN, SECRET);
    const update: TelegramUpdate = {
      update_id: 200,
      my_chat_member: {
        chat: { id: -100, type: "private" },
        from: { id: 555, is_bot: false, first_name: "Alice" },
        old_chat_member: { status: "member", user: { id: 1, is_bot: true, first_name: "Bot" } },
        new_chat_member: { status: "kicked", user: { id: 1, is_bot: true, first_name: "Bot" } },
      },
    };
    const res = await post(app, update, SECRET);
    expect(res.status).toBe(200);
    expect((sql as unknown as ReturnType<typeof mock>).mock.calls.length).toBeGreaterThan(0);
  });

  it("handles message /start and returns 200", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET, "царёво.рф");
    const update: TelegramUpdate = {
      update_id: 300,
      message: {
        message_id: 1,
        chat: { id: 777, type: "private" },
        text: "/start",
      },
    };
    const res = await post(app, update, SECRET);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain("sendMessage");
  });
});
