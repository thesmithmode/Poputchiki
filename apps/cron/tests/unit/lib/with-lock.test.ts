import { describe, expect, it, vi } from "vitest";
import { withLock } from "../../../src/lib/with-lock";

function makeSql(acquired: boolean) {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi.fn().mockResolvedValueOnce([{ acquired }]);
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("withLock", () => {
  it("returns fn result when lock acquired", async () => {
    const sql = makeSql(true);
    const result = await withLock(sql, 42, async () => "ok");
    expect(result).toBe("ok");
  });

  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false);
    const result = await withLock(sql, 42, async () => "ok");
    expect(result).toBeNull();
  });

  it("fn receives tx from begin", async () => {
    let receivedTx: unknown;
    const sql = makeSql(true);
    await withLock(sql, 99, async (tx) => {
      receivedTx = tx;
    });
    expect(receivedTx).toBeDefined();
    expect(sql.begin).toHaveBeenCalledOnce();
  });

  it("propagates error from fn (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql(true);
    await expect(
      withLock(sql, 99, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
