import { describe, expect, it, vi } from "vitest";
import { refreshUserStats } from "../../src/refresh-user-stats";

function makeSql(...returnValues: unknown[]) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const val = returnValues[call] ?? [];
    call++;
    return Promise.resolve(val);
  }) as unknown as import("postgres").Sql;
}

describe("refreshUserStats", () => {
  it("returns null when advisory lock not acquired", async () => {
    const sql = makeSql([{ acquired: false }]);
    const result = await refreshUserStats(sql);
    expect(result).toBeNull();
  });

  it("runs REFRESH CONCURRENTLY and releases lock when acquired", async () => {
    const sql = makeSql([{ acquired: true }], [], []);
    const result = await refreshUserStats(sql);
    expect(result).toEqual({ refreshed: true });
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("releases lock even if refresh throws", async () => {
    let call = 0;
    const sql = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve([{ acquired: true }]);
      if (call === 2) return Promise.reject(new Error("refresh failed"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(refreshUserStats(sql)).rejects.toThrow("refresh failed");
    expect(call).toBe(3);
  });
});
