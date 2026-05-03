import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupNonces } from "../../src/cleanup-nonces";

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

describe("cleanupNonces", () => {
  afterEach(() => vi.restoreAllMocks());

  it("первый вызов: pg_try_advisory_lock с LOCK_ID 100001", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    await cleanupNonces(sql);
    expect(calls[0]?.sql).toContain("pg_try_advisory_lock");
    expect(calls[0]?.params).toEqual([100001]);
  });

  it("returns null when advisory lock not acquired (без DELETE)", async () => {
    const { sql, calls } = makeSql([{ acquired: false }]);
    const result = await cleanupNonces(sql);
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).not.toContain("DELETE FROM nonces");
  });

  it("выполняет DELETE FROM nonces с TTL '10 minutes' и возвращает count", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "7" }], []);
    const result = await cleanupNonces(sql);
    expect(result).toEqual({ deleted: 7 });
    expect(calls).toHaveLength(3);
    expect(calls[1]?.sql).toContain("DELETE FROM nonces");
    expect(calls[1]?.sql).toContain("created_at <");
    expect(calls[1]?.params).toEqual(["10 minutes"]);
  });

  it("освобождает advisory lock тем же LOCK_ID после DELETE", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    await cleanupNonces(sql);
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
    expect(calls[2]?.params).toEqual([100001]);
  });

  it("deleted=0 when no nonces to clean", async () => {
    const { sql } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    expect(await cleanupNonces(sql)).toEqual({ deleted: 0 });
  });

  it("releases lock even if delete throws", async () => {
    const calls: CapturedCall[] = [];
    let i = 0;
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      i++;
      const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
      calls.push({ sql: joined, params: [] });
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      if (i === 2) return Promise.reject(new Error("DB error"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(cleanupNonces(sql)).rejects.toThrow("DB error");
    expect(i).toBe(3);
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
  });
});
