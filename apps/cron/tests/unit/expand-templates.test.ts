import { describe, expect, it, vi } from "vitest";
import { expandTemplates } from "../../src/expand-templates";

type Row = Record<string, unknown>;

// expandTemplates использует useServiceRole=true → порядок: [SET ROLE, lock, data]
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

describe("expandTemplates", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await expandTemplates(sql)).toBeNull();
  });

  it("no templates matched → created=0", async () => {
    const sql = makeSql(true, [[]]);
    expect(await expandTemplates(sql)).toEqual({ created: 0 });
  });

  it("INSERT RETURNING N rows → created=N", async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: `r${i}` }));
    const sql = makeSql(true, [rows]);
    expect(await expandTemplates(sql)).toEqual({ created: 10 });
  });

  it("idempotent: ON CONFLICT DO NOTHING → INSERT returns 0 rows → created=0", async () => {
    const sql = makeSql(true, [[]]); // all rows conflicted
    expect(await expandTemplates(sql)).toEqual({ created: 0 });
  });

  it("propagates error from INSERT", async () => {
    const sql = makeSql(true, [new Error("insert failed")]);
    await expect(expandTemplates(sql)).rejects.toThrow("insert failed");
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

  it("single batch INSERT — SET ROLE + lock + 1 SQL call total (не N×M вызовов)", async () => {
    let txCallCount = 0;
    let insertSql = "";
    const begin = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
        txCallCount++;
        if (txCallCount === 1) return Promise.resolve([]); // SET LOCAL ROLE
        if (txCallCount === 2) return Promise.resolve([{ acquired: true }]); // lock
        insertSql = strings.join("");
        return Promise.resolve([{ id: "r1" }, { id: "r2" }]);
      });
      return fn(tx);
    });
    const sql = { begin } as unknown as import("postgres").Sql;
    const result = await expandTemplates(sql, new Date("2026-05-04T12:00:00Z"));
    expect(txCallCount).toBe(3); // SET ROLE + lock + 1 INSERT
    expect(result?.created).toBe(2);
    expect(insertSql).toContain("INSERT INTO rides");
    expect(insertSql).toContain("generate_series");
    expect(insertSql).toContain("ON CONFLICT");
  });
});
