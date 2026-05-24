import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleCallbackQuery } from "../../src/handlers/callback-query";
import type { TelegramCallbackQuery } from "../../src/types/telegram";

const REQUEST_ID = "11111111-1111-4111-a111-111111111111";

function makeQuery(
  data: string,
  fromId = 999,
  text = "У вас новая заявка на поездку",
): TelegramCallbackQuery {
  return {
    id: "cb-1",
    from: { id: fromId, is_bot: false, first_name: "Driver" },
    data,
    message: {
      message_id: 42,
      chat: { id: 555, type: "private" },
      text,
    },
  };
}

function deps(fetchFn: ReturnType<typeof vi.fn>) {
  return {
    botToken: "TOKEN",
    apiUrl: "http://api",
    internalSecret: "SECRET",
    fetchFn: fetchFn as unknown as typeof fetch,
  };
}

describe("handleCallbackQuery", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
  });

  it("неизвестный callback_data → answerCallbackQuery с 'Неизвестная команда'", async () => {
    await handleCallbackQuery(deps(fetchMock), makeQuery("garbage"));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("answerCallbackQuery");
    const body = JSON.parse(init.body as string);
    expect(body.text).toContain("Неизвестная");
  });

  it("успешный accept → POST internal endpoint + editMessageText (со статусом) + answerCallbackQuery", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // internal API
      .mockResolvedValueOnce(new Response("{}", { status: 200 })) // editMessageText
      .mockResolvedValueOnce(new Response("{}", { status: 200 })); // answer

    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [apiUrl, apiInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(apiUrl).toBe(`http://api/internal/ride-requests/${REQUEST_ID}/accept`);
    expect((apiInit.headers as Record<string, string>)["X-Internal-Secret"]).toBe("SECRET");
    const apiBody = JSON.parse(apiInit.body as string);
    expect(apiBody.tg_id).toBe(999);

    const [editUrl, editInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(editUrl).toContain("editMessageText");
    const editBody = JSON.parse(editInit.body as string);
    expect(editBody.text).toContain("✅");
    expect(editBody.reply_markup).toEqual({ inline_keyboard: [] });

    const [answerUrl, answerInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(answerUrl).toContain("answerCallbackQuery");
    const answerBody = JSON.parse(answerInit.body as string);
    expect(answerBody.text).toContain("Принято");
  });

  it("успешный reject → внутренний endpoint c action=reject + editMessageText с ❌", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:reject:${REQUEST_ID}`));
    const [apiUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(apiUrl).toContain(`/${REQUEST_ID}/reject`);
    const [editUrl, editInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(editUrl).toContain("editMessageText");
    const editBody = JSON.parse(editInit.body as string);
    expect(editBody.text).toContain("❌");
    const [, lastInit] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
      string,
      RequestInit,
    ];
    const answerBody = JSON.parse(lastInit.body as string);
    expect(answerBody.text).toContain("Отклонено");
  });

  it("403 от API → 'Доступ запрещён' и НЕ editMessage", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"forbidden"}', { status: 403 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    // 2 calls: internal + answer, no edit
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("Доступ");
  });

  it("404 → 'Заявка не найдена'", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"not_found"}', { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("не найдена");
  });

  it("409 no_seats → 'Нет свободных мест'", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"no_seats"}', { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("мест");
  });

  it("409 invalid_state → 'Заявка уже обработана'", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"invalid_state"}', { status: 409 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("обработана");
  });

  it("500 → 'Ошибка обработки'", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("Ошибка");
  });

  it("fetch throw → 'Сервис недоступен' + НЕ editMessage", async () => {
    fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`req:accept:${REQUEST_ID}`));
    const [, answerInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(answerInit.body as string).text).toContain("недоступен");
  });

  // Branch line 32: `query.data ?? ""` — data undefined → пустая строка → не матчит regex.
  it("query без data → 'Неизвестная команда'", async () => {
    const q = makeQuery("foo");
    const { data: _omit, ...rest } = q;
    await handleCallbackQuery(deps(fetchMock), rest as TelegramCallbackQuery);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).text).toContain("Неизвестная");
  });

  // Branch line 61: `query.message.text ?? ""` — message без text → editMessageText
  // получает только statusLine (без префикса).
  it("query.message без text → editMessageText со статусом без префикса", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const q = makeQuery(`req:accept:${REQUEST_ID}`);
    if (q.message) {
      const { text: _omit, ...rest } = q.message;
      q.message = rest as typeof q.message;
    }
    await handleCallbackQuery(deps(fetchMock), q);
    const editCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("editMessageText"));
    expect(editCall).toBeDefined();
    const editBody = JSON.parse((editCall?.[1] as RequestInit).body as string);
    expect(editBody.text).toBe("\n\n✅ Принято");
  });

  it("query без message → success path не вызывает editMessage", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const q = makeQuery(`req:accept:${REQUEST_ID}`);
    const { message: _omit, ...rest } = q;
    await handleCallbackQuery(deps(fetchMock), rest as TelegramCallbackQuery);
    // 2 calls: internal API + answer (no edit)
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("editMessageText"))).toBe(false);
  });

  it("sub:accept → POST /internal/template-subscriptions/:id/accept + edit + answer", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`sub:accept:${REQUEST_ID}`));
    const [apiUrl, apiInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(apiUrl).toBe(`http://api/internal/template-subscriptions/${REQUEST_ID}/accept`);
    expect((apiInit.headers as Record<string, string>)["X-Internal-Secret"]).toBe("SECRET");
    const apiBody = JSON.parse(apiInit.body as string);
    expect(apiBody.tg_id).toBe(999);
    const editCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("editMessageText"));
    expect(editCall).toBeDefined();
    const editBody = JSON.parse((editCall?.[1] as RequestInit).body as string);
    expect(editBody.text).toContain("✅");
  });

  it("sub:reject → POST /internal/template-subscriptions/:id/reject", async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await handleCallbackQuery(deps(fetchMock), makeQuery(`sub:reject:${REQUEST_ID}`));
    const [apiUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(apiUrl).toContain(`template-subscriptions/${REQUEST_ID}/reject`);
    const answerCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
      string,
      RequestInit,
    ];
    const answerBody = JSON.parse(answerCall[1].body as string);
    expect(answerBody.text).toContain("Отклонено");
  });
});
