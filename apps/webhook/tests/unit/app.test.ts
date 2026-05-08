import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import type { TelegramUpdate } from "../../src/types/telegram";

const SECRET = "super-secret-token-xyz";
const BOT_TOKEN = "bot123token";

function makeSql() {
  return vi.fn(() => Promise.resolve([])) as unknown as import("postgres").Sql;
}

function post(
  app: ReturnType<typeof createApp>,
  update: TelegramUpdate,
  secret?: string,
  path = "/tg/webhook",
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret !== undefined) headers["X-Telegram-Bot-Api-Secret-Token"] = secret;
  return app.request(path, {
    method: "POST",
    headers,
    body: JSON.stringify(update),
  });
}

function baseUpdate(id = 1): TelegramUpdate {
  return { update_id: id };
}

describe("webhook handlers", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect((sql as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
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
    expect((sql as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0);
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

  it("canonical /webhook/tg path returns 200 with valid secret", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET);
    const res = await post(app, baseUpdate(400), SECRET, "/webhook/tg");
    expect(res.status).toBe(200);
  });

  it("canonical /webhook/tg path returns 401 without secret", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET);
    const res = await post(app, baseUpdate(401), undefined, "/webhook/tg");
    expect(res.status).toBe(401);
  });

  it("handles callback_query and returns 200", async () => {
    const app = createApp(makeSql(), BOT_TOKEN, SECRET);
    const update: TelegramUpdate = {
      update_id: 500,
      callback_query: {
        id: "cq1",
        from: { id: 10, is_bot: false, first_name: "Bob" },
        data: "action:confirm",
      },
    };
    const res = await post(app, update, SECRET);
    expect(res.status).toBe(200);
  });
});
