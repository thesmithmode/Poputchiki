import { describe, expect, it, vi } from "vitest";
import { expandTemplates } from "../../src/expand-templates";

type Row = Record<string, unknown>;

// expandTemplates использует useServiceRole=true → порядок: [SET ROLE, lock, data...]
function makeSql(acquired: boolean, txResponses: (Row[] | Error)[]): import("postgres").Sql {
  return {
    begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      let i = 0;
      const tx = vi.fn().mockImplementation(() => {
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
      return fn(tx);
    }),
  } as unknown as import("postgres").Sql;
}

const RIDE_ROW = { id: "r1", template_id: "t1", driver_id: "d1", departure_at: new Date() };

describe("expandTemplates", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await expandTemplates(sql)).toBeNull();
  });

  it("no templates matched → created=0, subscriptionRequestsCreated=0", async () => {
    // Rides INSERT returns [] → subscription INSERT not called
    const sql = makeSql(true, [[]]);
    expect(await expandTemplates(sql)).toEqual({ created: 0, subscriptionRequestsCreated: 0 });
  });

  it("INSERT RETURNING N rows → created=N, no subscriptions → subscriptionRequestsCreated=0", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      template_id: `t${i}`,
      driver_id: `d${i}`,
      departure_at: new Date(),
    }));
    // Rides INSERT returns rows, subscription INSERT returns []
    const sql = makeSql(true, [rows, []]);
    expect(await expandTemplates(sql)).toEqual({ created: 10, subscriptionRequestsCreated: 0 });
  });

  it("idempotent: ON CONFLICT DO NOTHING → INSERT returns 0 rows → created=0", async () => {
    const sql = makeSql(true, [[]]); // all rows conflicted
    expect(await expandTemplates(sql)).toEqual({ created: 0, subscriptionRequestsCreated: 0 });
  });

  it("propagates error from INSERT", async () => {
    const sql = makeSql(true, [new Error("insert failed")]);
    await expect(expandTemplates(sql)).rejects.toThrow("insert failed");
  });

  it("создаёт ride_requests для активных подписчиков", async () => {
    const subReq = { id: "rr-1", ride_id: "r1", passenger_id: "pass-1" };
    // rides INSERT → 1 row, sub INSERT → 1 row, book_seat → 1 row (success)
    const sql = makeSql(true, [[RIDE_ROW], [subReq], [{ id: "r1" }]]);
    const result = await expandTemplates(sql);
    expect(result).toEqual({ created: 1, subscriptionRequestsCreated: 1 });
  });

  it("понижает status до pending если book_seat вернул 0 rows (нет мест)", async () => {
    const subReq = { id: "rr-1", ride_id: "r1", passenger_id: "pass-1" };
    // rides INSERT → row, sub INSERT → row, book_seat → [] (no seats), UPDATE status=pending → []
    const sql = makeSql(true, [[RIDE_ROW], [subReq], [], []]);
    const result = await expandTemplates(sql);
    expect(result).toEqual({ created: 1, subscriptionRequestsCreated: 1 });
  });

  it("нет подписок для новых rides → subscriptionRequestsCreated=0", async () => {
    // rides INSERT → row, sub INSERT → [] (no active subscriptions)
    const sql = makeSql(true, [[RIDE_ROW], []]);
    const result = await expandTemplates(sql);
    expect(result).toEqual({ created: 1, subscriptionRequestsCreated: 0 });
  });

  it("SET LOCAL ROLE poputchiki_service вызывается первым", async () => {
    const calls: string[] = [];
    const tx = vi.fn().mockImplementation((strings: TemplateStringsArray, ..._v: unknown[]) => {
      const q = strings.join("?");
      calls.push(q);
      if (q.includes("SET LOCAL ROLE")) return Promise.resolve([]);
      if (q.includes("pg_try_advisory_xact_lock")) return Promise.resolve([{ acquired: true }]);
      return Promise.resolve([]);
    });
    const sql = {
      begin: vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("postgres").Sql;
    await expandTemplates(sql);
    expect(calls[0]).toContain("SET LOCAL ROLE poputchiki_service");
  });

  it("batch INSERT rides + batch INSERT subscriptions (не N×M на шаблоны)", async () => {
    let txCallCount = 0;
    let firstInsertSql = "";
    let secondInsertSql = "";
    const begin = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        txCallCount++;
        if (txCallCount === 1) return Promise.resolve([]); // SET LOCAL ROLE
        if (txCallCount === 2) return Promise.resolve([{ acquired: true }]); // lock
        if (txCallCount === 3) {
          firstInsertSql = strings.join("");
          // Return 2 new rides
          return Promise.resolve([
            { id: "r1", template_id: "t1", driver_id: "d1", departure_at: new Date() },
            { id: "r2", template_id: "t1", driver_id: "d1", departure_at: new Date() },
          ]);
        }
        if (txCallCount === 4) {
          secondInsertSql = strings.join("");
          return Promise.resolve([]); // no subscriptions
        }
        return Promise.resolve([]);
      });
      return fn(tx);
    });
    const sql = { begin } as unknown as import("postgres").Sql;
    const result = await expandTemplates(sql, new Date("2026-05-04T12:00:00Z"));
    expect(result?.created).toBe(2);
    expect(result?.subscriptionRequestsCreated).toBe(0);
    expect(firstInsertSql).toContain("INSERT INTO rides");
    expect(firstInsertSql).toContain("generate_series");
    expect(firstInsertSql).toContain("ON CONFLICT");
    expect(secondInsertSql).toContain("INSERT INTO ride_requests");
    // 4 calls: SET ROLE + lock + INSERT rides + INSERT ride_requests
    expect(txCallCount).toBe(4);
  });
});
