import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeRides } from "../../src/finalize-rides";

type Row = Record<string, unknown>;

function makeSql(txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
        const resp = txResponses[i] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("finalizeRides", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await finalizeRides(sql)).toBeNull();
  });

  it("returns completed=0, archived=0 when no rides to process", async () => {
    // lock check, UPDATE completed (empty), UPDATE archived (empty)
    const sql = makeSql([[{ acquired: true }], [], []]);
    const result = await finalizeRides(sql);
    expect(result).toEqual({ completed: 0, archived: 0 });
  });

  it("returns completed=1 when one ride transitions active→completed", async () => {
    const completedRide = { id: "rid-1", driver_id: "drv-1" };
    const sql = makeSql([
      [{ acquired: true }],
      [completedRide], // UPDATE completed
      [], // UPDATE archived
      [], // INSERT audit_log
      [], // pg_notify driver
    ]);
    const result = await finalizeRides(sql);
    expect(result?.completed).toBe(1);
    expect(result?.archived).toBe(0);
  });

  it("returns archived=1 when one ride transitions completed→archived", async () => {
    const sql = makeSql([
      [{ acquired: true }],
      [], // UPDATE completed (no rides)
      [{ id: "rid-2" }], // UPDATE archived
      [], // INSERT audit_log archived
    ]);
    const result = await finalizeRides(sql);
    expect(result?.completed).toBe(0);
    expect(result?.archived).toBe(1);
  });

  it("propagates error from UPDATE (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql([
      [{ acquired: true }],
      new Error("DB fail"), // UPDATE completed throws
    ]);
    await expect(finalizeRides(sql)).rejects.toThrow("DB fail");
  });
});
