import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAnomalies } from "../../src/anomaly-detect";

type FetcherArgs = [string, { body: string }];

function makeSql(newUserCount: number): import("postgres").Sql {
  return vi
    .fn()
    .mockResolvedValue([{ count: String(newUserCount) }]) as unknown as import("postgres").Sql;
}

describe("detectAnomalies", () => {
  afterEach(() => {
    delete process.env.BOT_TOKEN;
    delete process.env.ADMIN_TG_CHAT_ID;
  });

  it("не отправляет алерт когда новых юзеров меньше порога", async () => {
    const mockFetch = vi.fn();
    await detectAnomalies(makeSql(10), mockFetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("не отправляет алерт ровно на пороге (50)", async () => {
    const mockFetch = vi.fn();
    await detectAnomalies(makeSql(50), mockFetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("отправляет admin TG-алерт когда >50 новых юзеров за 24ч", async () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.ADMIN_TG_CHAT_ID = "123456";
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    await detectAnomalies(makeSql(51), mockFetch);
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0] as FetcherArgs;
    expect(url).toContain("test-token");
    expect(url).toContain("sendMessage");
    const body = JSON.parse(opts.body) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("123456");
    expect(body.text).toContain("51");
  });

  it("не отправляет алерт если BOT_TOKEN не задан", async () => {
    process.env.ADMIN_TG_CHAT_ID = "123456";
    const mockFetch = vi.fn();
    await detectAnomalies(makeSql(100), mockFetch);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("не крашится если fetch падает", async () => {
    process.env.BOT_TOKEN = "test-token";
    process.env.ADMIN_TG_CHAT_ID = "123456";
    const mockFetch = vi.fn().mockRejectedValue(new Error("network"));
    await expect(detectAnomalies(makeSql(100), mockFetch)).resolves.not.toThrow();
  });
});
