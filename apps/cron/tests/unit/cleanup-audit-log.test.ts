import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupAuditLog } from "../../src/cleanup-audit-log";

type Row = Record<string, unknown>;

function makeSql(acquired: boolean, txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        if (i === 0) {
          i++;
          return Promise.resolve([{ acquired }]);
        }
        const resp = txResponses[i - 1] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("cleanupAuditLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupAuditLog(sql)).toBeNull();
  });

  it("returns deleted count", async () => {
    const sql = makeSql(true, [[{ count: "42" }]]);
    expect(await cleanupAuditLog(sql)).toEqual({ deleted: 42 });
  });

  it("deleted=0 when nothing to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupAuditLog(sql)).toEqual({ deleted: 0 });
  });

  it("propagates error (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql(true, [new Error("DB error")]);
    await expect(cleanupAuditLog(sql)).rejects.toThrow("DB error");
  });

  // Branch line 17: `countRows[0]?.count ?? 0` — empty result → undefined → 0.
  it("deleted=0 при пустом результате (countRows[]) — optional chain + ?? 0", async () => {
    const sql = makeSql(true, [[]]);
    expect(await cleanupAuditLog(sql)).toEqual({ deleted: 0 });
  });
});
