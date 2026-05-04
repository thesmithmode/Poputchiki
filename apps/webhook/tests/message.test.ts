import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { handleMessage } from "../src/handlers/message";
import type { TelegramMessage } from "../src/types/telegram";

function makeMessage(text: string, chatId = 111): TelegramMessage {
  return { message_id: 1, chat: { id: chatId, type: "private" }, text };
}

describe("handleMessage", () => {
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

  it("does nothing for non-/start non-/help text", async () => {
    await handleMessage("token", "domain.com", makeMessage("hello"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends sendMessage for /start", async () => {
    await handleMessage("mytoken", "domain.com", makeMessage("/start"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string, ...unknown[]];
    expect(url).toContain("sendMessage");
    expect(url).toContain("mytoken");
  });

  it("sends sendMessage for /help with domain", async () => {
    await handleMessage("mytoken", "domain.com", makeMessage("/help"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses domain in URL when provided", async () => {
    await handleMessage("tok", "царёво.рф", makeMessage("/start", 222));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("https://app.царёво.рф");
    expect(body.chat_id).toBe(222);
  });

  it("does nothing when domain is undefined (no useful link)", async () => {
    await handleMessage("tok", undefined, makeMessage("/start"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
