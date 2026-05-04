import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupNonces } from "../../src/cleanup-nonces";

type Row = Record<string, unknown>;

function makeSql(acquired: boolean, txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        if (i === 0) { i++; return Promise.resolve([{ acquired }]); }
        const resp = txResponses[i - 1] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("cleanupNonces", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await cleanupNonces(sql)).toBeNull();
  });

  it("returns deleted count when nonces cleaned up", async () => {
    const sql = makeSql(true, [[{ count: "7" }]]);
    expect(await cleanupNonces(sql)).toEqual({ deleted: 7 });
  });

  it("deleted=0 when no nonces to clean", async () => {
    const sql = makeSql(true, [[{ count: "0" }]]);
    expect(await cleanupNonces(sql)).toEqual({ deleted: 0 });
  });

  it("propagates error (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql(true, [new Error("DB error")]);
    await expect(cleanupNonces(sql)).rejects.toThrow("DB error");
  });
});
