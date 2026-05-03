import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupNonces } from "../../src/cleanup-nonces";

function makeSql(...returnValues: unknown[]) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const val = returnValues[call] ?? [];
    call++;
    return Promise.resolve(val);
  }) as unknown as import("postgres").Sql;
}

describe("cleanupNonces", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when advisory lock not acquired", async () => {
    const sql = makeSql([{ acquired: false }]);
    const result = await cleanupNonces(sql);
    expect(result).toBeNull();
  });

  it("deletes old nonces and releases lock when lock acquired", async () => {
    const sql = makeSql([{ acquired: true }], [{ count: "7" }], []);
    const result = await cleanupNonces(sql);
    expect(result).toEqual({ deleted: 7 });
    expect(sql).toHaveBeenCalledTimes(3);
  });

  it("deleted=0 when no nonces to clean", async () => {
    const sql = makeSql([{ acquired: true }], [{ count: "0" }], []);
    const result = await cleanupNonces(sql);
    expect(result).toEqual({ deleted: 0 });
  });

  it("releases lock even if delete throws", async () => {
    let call = 0;
    const sql = vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.resolve([{ acquired: true }]);
      if (call === 2) return Promise.reject(new Error("DB error"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(cleanupNonces(sql)).rejects.toThrow("DB error");
    expect(call).toBe(3); // lock + failed delete + unlock
  });
});
