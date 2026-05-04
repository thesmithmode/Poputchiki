import { describe, expect, it, vi } from "vitest";
import { expandTemplates } from "../../src/expand-templates";

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

const TMPL = {
  id: "t1",
  driver_id: "d1",
  from_label: "A",
  from_lat: 55.1,
  from_lng: 49.1,
  to_label: "B",
  to_lat: 55.2,
  to_lng: 49.2,
  departure_time: "08:30:00",
  weekdays: [1, 2, 3, 4, 5], // Mon-Fri
  price_rub: 200,
  seats_total: 3,
  comment: null,
  active_from: "2026-01-01",
  active_to: null,
};

describe("expandTemplates", () => {
  it("returns null when lock not acquired", async () => {
    const sql = makeSql(false, []);
    expect(await expandTemplates(sql)).toBeNull();
  });

  it("no templates → created=0", async () => {
    const sql = makeSql(true, [[]]); // SELECT returns empty
    expect(await expandTemplates(sql)).toEqual({ created: 0 });
  });

  it("Mon-Fri template from Mon → 10 rides created over 14 days", async () => {
    const now = new Date("2026-05-04T12:00:00Z"); // Monday
    // SELECT templates, then 10 successful INSERTs
    const txResponses: Row[][] = [[TMPL]];
    for (let i = 0; i < 10; i++) txResponses.push([{ id: `r${i}` }]);
    const sql = makeSql(true, txResponses);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(10);
  });

  it("idempotent: INSERT WHERE NOT EXISTS returns 0 rows → created=0", async () => {
    const now = new Date("2026-05-04T12:00:00Z");
    const txResponses: Row[][] = [[TMPL]];
    for (let i = 0; i < 10; i++) txResponses.push([]); // empty = already exists
    const sql = makeSql(true, txResponses);
    expect(await expandTemplates(sql, now)).toEqual({ created: 0 });
  });

  it("template with active_to in 2 days → only 2 weekday rides", async () => {
    const tmpl = { ...TMPL, weekdays: [1, 2, 3, 4, 5], active_to: "2026-05-05" }; // Mon+Tue only
    const now = new Date("2026-05-04T12:00:00Z");
    const sql = makeSql(true, [[tmpl], [{ id: "a" }], [{ id: "b" }]]);
    expect(await expandTemplates(sql, now)).toEqual({ created: 2 });
  });

  it("template with active_from next week → skips first week", async () => {
    const tmpl = { ...TMPL, active_from: "2026-05-11" }; // Mon next week
    const now = new Date("2026-05-04T12:00:00Z");
    const txResponses: Row[][] = [[tmpl]];
    for (let i = 0; i < 5; i++) txResponses.push([{ id: `x${i}` }]); // Mon-Fri 11-15
    const sql = makeSql(true, txResponses);
    expect(await expandTemplates(sql, now)).toEqual({ created: 5 });
  });

  it("Saturday-only template → 2 rides in 14 days", async () => {
    const tmpl = { ...TMPL, weekdays: [6] };
    const now = new Date("2026-05-04T12:00:00Z"); // Monday
    const sql = makeSql(true, [[tmpl], [{ id: "s1" }], [{ id: "s2" }]]);
    expect(await expandTemplates(sql, now)).toEqual({ created: 2 });
  });

  it("multiple templates — sums created", async () => {
    const t1 = { ...TMPL, id: "t1", weekdays: [1] }; // Mon
    const t2 = { ...TMPL, id: "t2", weekdays: [3] }; // Wed
    const now = new Date("2026-05-04T12:00:00Z");
    // t1: Mon 04, Mon 11 → 2; t2: Wed 06, Wed 13 → 2
    const sql = makeSql(true, [
      [t1, t2],
      [{ id: "r1" }],
      [{ id: "r2" }], // t1
      [{ id: "r3" }],
      [{ id: "r4" }], // t2
    ]);
    expect(await expandTemplates(sql, now)).toEqual({ created: 4 });
  });

  it("propagates error from SELECT templates", async () => {
    const sql = makeSql(true, [new Error("select failed")]);
    await expect(expandTemplates(sql)).rejects.toThrow("select failed");
  });
});
