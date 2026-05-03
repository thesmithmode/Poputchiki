import { describe, expect, it, vi } from "vitest";
import { refreshUserStats } from "../../src/refresh-user-stats";

interface CapturedCall {
  sql: string;
  params: unknown[];
}

function makeSql(...returnValues: unknown[]): {
  sql: import("postgres").Sql;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let i = 0;
  const fn = vi.fn().mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
    const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
    calls.push({ sql: joined, params });
    const val = returnValues[i] ?? [];
    i++;
    return Promise.resolve(val);
  });
  return { sql: fn as unknown as import("postgres").Sql, calls };
}

describe("refreshUserStats", () => {
  it("первый вызов: pg_try_advisory_lock с LOCK_ID 100002", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [], []);
    await refreshUserStats(sql);
    expect(calls[0]?.sql).toContain("pg_try_advisory_lock");
    expect(calls[0]?.params).toEqual([100002]);
  });

  it("returns null when advisory lock not acquired (без REFRESH)", async () => {
    const { sql, calls } = makeSql([{ acquired: false }]);
    const result = await refreshUserStats(sql);
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).not.toContain("REFRESH");
  });

  it("выполняет REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [], []);
    const result = await refreshUserStats(sql);
    expect(result).toEqual({ refreshed: true });
    expect(calls).toHaveLength(3);
    expect(calls[1]?.sql).toContain("REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats");
  });

  it("освобождает advisory lock тем же LOCK_ID 100002", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [], []);
    await refreshUserStats(sql);
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
    expect(calls[2]?.params).toEqual([100002]);
  });

  it("releases lock even if refresh throws", async () => {
    const calls: CapturedCall[] = [];
    let i = 0;
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      i++;
      const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
      calls.push({ sql: joined, params: [] });
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      if (i === 2) return Promise.reject(new Error("refresh failed"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(refreshUserStats(sql)).rejects.toThrow("refresh failed");
    expect(i).toBe(3);
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
  });
});
