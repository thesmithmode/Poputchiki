import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeRides } from "../../src/finalize-rides";

type Row = Record<string, unknown>;

function makeSql(responses: (Row[] | Error)[]): import("postgres").Sql {
  let i = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[i] ?? [];
    i++;
    return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
  }) as unknown as import("postgres").Sql;
}

describe("finalizeRides", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql([[{ acquired: false }]]);
    expect(await finalizeRides(sql)).toBeNull();
  });

  it("returns completed=0, archived=0 when no rides to process", async () => {
    const sql = makeSql([[{ acquired: true }], [], [], []]);
    const result = await finalizeRides(sql);
    expect(result).toEqual({ completed: 0, archived: 0 });
  });

  it("returns completed=1 when one ride transitions active→completed", async () => {
    const completedRide = { id: "rid-1", driver_id: "drv-1" };
    const sql = makeSql([
      [{ acquired: true }],
      [completedRide], // UPDATE completed
      [], // UPDATE archived
      [], // INSERT audit_log completed
      [], // pg_notify
      [], // pg_advisory_unlock
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
      [], // pg_advisory_unlock
    ]);
    const result = await finalizeRides(sql);
    expect(result?.completed).toBe(0);
    expect(result?.archived).toBe(1);
  });

  it("releases lock even if UPDATE throws", async () => {
    let calls = 0;
    const sql = vi.fn().mockImplementation(() => {
      calls++;
      if (calls === 1) return Promise.resolve([{ acquired: true }]);
      if (calls === 2) return Promise.reject(new Error("DB fail"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;
    await expect(finalizeRides(sql)).rejects.toThrow("DB fail");
    expect(calls).toBeGreaterThanOrEqual(3); // lock + fail + unlock
  });
});
