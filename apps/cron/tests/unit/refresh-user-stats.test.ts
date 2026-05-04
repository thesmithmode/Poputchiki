import { describe, expect, it, vi } from "vitest";
import { refreshUserStats } from "../../src/refresh-user-stats";

type Row = Record<string, unknown>;

function makeSql(acquired: boolean, reservedResponses: (Row[] | Error)[]): import("postgres").Sql {
  let i = 0;
  const reserved = vi.fn().mockImplementation(() => {
    if (i === 0) { i++; return Promise.resolve([{ acquired }]); }
    const resp = reservedResponses[i - 1] ?? [];
    i++;
    return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
  });
  (reserved as Record<string, unknown>).release = vi.fn();
  return {
    reserve: vi.fn().mockResolvedValue(reserved),
  } as unknown as import("postgres").Sql;
}

describe("refreshUserStats", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await refreshUserStats(sql)).toBeNull();
  });

  it("returns { refreshed: true } on success", async () => {
    const sql = makeSql(true, [[], []]); // REFRESH, unlock
    expect(await refreshUserStats(sql)).toEqual({ refreshed: true });
  });

  it("calls reserve() and release() to pin a single connection", async () => {
    const sql = makeSql(true, [[], []]);
    await refreshUserStats(sql);
    expect((sql as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve).toHaveBeenCalledOnce();
  });

  it("releases reserved connection even if REFRESH throws", async () => {
    const sql = makeSql(true, [new Error("refresh failed"), []]);
    await expect(refreshUserStats(sql)).rejects.toThrow("refresh failed");
    // release() must still be called
    const reserveMock = (sql as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve;
    const reserved = await reserveMock.mock.results[0]?.value;
    expect((reserved as Record<string, ReturnType<typeof vi.fn>>).release).toHaveBeenCalledOnce();
  });

  it("releases reserved connection if lock not acquired", async () => {
    const sql = makeSql(false, []);
    await refreshUserStats(sql);
    const reserveMock = (sql as unknown as { reserve: ReturnType<typeof vi.fn> }).reserve;
    const reserved = await reserveMock.mock.results[0]?.value;
    expect((reserved as Record<string, ReturnType<typeof vi.fn>>).release).toHaveBeenCalledOnce();
  });
});
