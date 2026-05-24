import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeRides } from "../../src/finalize-rides";

type Row = Record<string, unknown>;

// finalizeRides использует useServiceRole=true → порядок: [SET ROLE, lock, data...]
function makeSql(acquired: boolean, txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const txFn = vi.fn().mockImplementation(() => {
        // SET LOCAL ROLE — первый вызов
        if (i === 0) {
          i++;
          return Promise.resolve([]);
        }
        // advisory lock — второй вызов
        if (i === 1) {
          i++;
          return Promise.resolve([{ acquired }]);
        }
        // данные — остальные
        const resp = txResponses[i - 2] ?? [];
        i++;
        return resp instanceof Error ? Promise.reject(resp) : Promise.resolve(resp);
      });
      // biome-ignore lint/suspicious/noExplicitAny: postgres.js tx mock нужен any для .json
      const tx = txFn as any;
      tx.json = (v: unknown) => JSON.stringify(v);
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

describe("finalizeRides", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await finalizeRides(sql)).toBeNull();
  });

  it("returns completed=0, archived=0 when no rides to process", async () => {
    // UPDATE completed (empty), UPDATE archived (empty)
    const sql = makeSql(true, [[], []]);
    const result = await finalizeRides(sql);
    expect(result).toEqual({ completed: 0, archived: 0 });
  });

  it("returns completed=1 when one ride transitions active→completed", async () => {
    const completedRide = { id: "rid-1", driver_id: "drv-1" };
    const sql = makeSql(true, [
      [completedRide], // UPDATE completed
      [], // UPDATE archived
      [], // INSERT audit_log
      [], // enqueueNotification
    ]);
    const result = await finalizeRides(sql);
    expect(result?.completed).toBe(1);
    expect(result?.archived).toBe(0);
  });

  it("returns archived=1 when one ride transitions completed→archived", async () => {
    const sql = makeSql(true, [
      [], // UPDATE completed (no rides)
      [{ id: "rid-2" }], // UPDATE archived
      [], // INSERT audit_log archived
    ]);
    const result = await finalizeRides(sql);
    expect(result?.completed).toBe(0);
    expect(result?.archived).toBe(1);
  });

  it("propagates error from UPDATE (transaction rollbacks, lock auto-released)", async () => {
    const sql = makeSql(true, [new Error("DB fail")]);
    await expect(finalizeRides(sql)).rejects.toThrow("DB fail");
  });

  it("SET LOCAL ROLE poputchiki_service вызывается первым", async () => {
    const calls: string[] = [];
    const txFn = vi.fn().mockImplementation((strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join("?");
      calls.push(q);
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([]);
    });
    // biome-ignore lint/suspicious/noExplicitAny: postgres.js tx mock нужен any для .json
    const tx = txFn as any;
    tx.json = (v: unknown) => JSON.stringify(v);
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await finalizeRides(sql);
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });
});
