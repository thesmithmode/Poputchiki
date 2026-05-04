import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupAuditLog } from "../../src/cleanup-audit-log";

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

describe("cleanupAuditLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("первый вызов: pg_try_advisory_lock с LOCK_ID 100004", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    await cleanupAuditLog(sql);
    expect(calls[0]?.sql).toContain("pg_try_advisory_lock");
    expect(calls[0]?.params).toEqual([100004]);
  });

  it("returns null when lock not acquired", async () => {
    const { sql, calls } = makeSql([{ acquired: false }]);
    const result = await cleanupAuditLog(sql);
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("DELETE FROM audit_log с retention 12 months", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "42" }], []);
    const result = await cleanupAuditLog(sql);
    expect(result).toEqual({ deleted: 42 });
    expect(calls[1]?.sql).toContain("DELETE FROM audit_log");
    expect(calls[1]?.params).toEqual(["12 months"]);
  });

  it("освобождает advisory lock после DELETE", async () => {
    const { sql, calls } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    await cleanupAuditLog(sql);
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
    expect(calls[2]?.params).toEqual([100004]);
  });

  it("deleted=0 when nothing to clean", async () => {
    const { sql } = makeSql([{ acquired: true }], [{ count: "0" }], []);
    expect(await cleanupAuditLog(sql)).toEqual({ deleted: 0 });
  });

  it("releases lock even if DELETE throws", async () => {
    let i = 0;
    const calls: CapturedCall[] = [];
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      i++;
      const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
      calls.push({ sql: joined, params: [] });
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      if (i === 2) return Promise.reject(new Error("DB error"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(cleanupAuditLog(sql)).rejects.toThrow("DB error");
    expect(calls[2]?.sql).toContain("pg_advisory_unlock");
  });
});
