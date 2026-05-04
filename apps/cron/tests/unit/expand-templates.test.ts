import { describe, expect, it, vi } from "vitest";
import { expandTemplates } from "../../src/expand-templates";

interface CapturedCall {
  sql: string;
  params: unknown[];
}

function makeSqlSequence(returnValues: unknown[]): {
  sql: import("postgres").Sql;
  calls: CapturedCall[];
} {
  const calls: CapturedCall[] = [];
  let i = 0;
  const fn = vi.fn().mockImplementation((strings: TemplateStringsArray, ...params: unknown[]) => {
    const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
    calls.push({ sql: joined, params });
    const val = returnValues[i] ?? [];
    i++;
    return Promise.resolve(val);
  });
  return { sql: fn as unknown as import("postgres").Sql, calls };
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
  weekdays: [1, 2, 3, 4, 5], // Пн-Пт
  price_rub: 200,
  seats_total: 3,
  comment: null,
  active_from: "2026-01-01",
  active_to: null,
};

describe("expandTemplates", () => {
  it("returns null when advisory lock not acquired", async () => {
    const { sql, calls } = makeSqlSequence([[{ acquired: false }]]);
    const result = await expandTemplates(sql);
    expect(result).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("pg_try_advisory_lock");
    expect(calls[0]?.params).toEqual([100003]);
  });

  it("Пн-Пт template на 14 дней → 10 INSERT попыток (Пн-Пт × 2 недели)", async () => {
    // Mon 2026-05-04 anchor
    const now = new Date("2026-05-04T12:00:00Z");
    // Sequence: lock, SELECT templates, then 14 INSERTs, then unlock
    const seq: unknown[] = [
      [{ acquired: true }],
      [TMPL],
      // 14 day inserts: 10 weekday INSERTs return [{id}] (created), weekend skipped (no SQL call).
      // Actually weekend days are skipped before INSERT so won't appear in calls.
    ];
    // 10 INSERTs each return [{id:'r'}]
    for (let i = 0; i < 10; i++) seq.push([{ id: `r${i}` }]);
    seq.push([]); // unlock

    const { sql, calls } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(10);
    // 1 lock + 1 SELECT + 10 INSERT + 1 unlock = 13
    expect(calls).toHaveLength(13);
    expect(calls[0]?.sql).toContain("pg_try_advisory_lock");
    expect(calls[1]?.sql).toContain("FROM ride_templates");
    expect(calls[12]?.sql).toContain("pg_advisory_unlock");
  });

  it("idempotent: повторный запуск создаёт 0 если NOT EXISTS пустой", async () => {
    const now = new Date("2026-05-04T12:00:00Z");
    const seq: unknown[] = [[{ acquired: true }], [TMPL]];
    for (let i = 0; i < 10; i++) seq.push([]); // INSERT ... WHERE NOT EXISTS → 0 rows
    seq.push([]);

    const { sql } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(0);
  });

  it("template без подходящих weekdays → 0 INSERTs", async () => {
    const tmpl = { ...TMPL, weekdays: [6] }; // только суббота
    const now = new Date("2026-05-04T12:00:00Z"); // Пн
    const seq: unknown[] = [[{ acquired: true }], [tmpl]];
    // 14 days → 2 субботы (10, 17 мая)
    seq.push([{ id: "x1" }], [{ id: "x2" }]);
    seq.push([]);

    const { sql, calls } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(2);
    expect(calls).toHaveLength(5); // lock, SELECT, 2 INSERTs, unlock
  });

  it("template с active_to в будущем — учитывается", async () => {
    const tmpl = { ...TMPL, active_to: "2026-05-06" }; // Mon-Wed только
    const now = new Date("2026-05-04T12:00:00Z");
    const seq: unknown[] = [[{ acquired: true }], [tmpl]];
    // Пн 04, Вт 05, Ср 06 — 3 INSERT
    seq.push([{ id: "a" }], [{ id: "b" }], [{ id: "c" }]);
    seq.push([]);

    const { sql } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(3);
  });

  it("template с active_from в будущем — пропускает дни до active_from", async () => {
    const tmpl = { ...TMPL, active_from: "2026-05-11" }; // через неделю
    const now = new Date("2026-05-04T12:00:00Z");
    const seq: unknown[] = [[{ acquired: true }], [tmpl]];
    // Пн 11, Вт 12, Ср 13, Чт 14, Пт 15 → 5 INSERTs (вторая неделя горизонта)
    for (let i = 0; i < 5; i++) seq.push([{ id: `x${i}` }]);
    seq.push([]);

    const { sql } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(5);
  });

  it("releases advisory lock даже при ошибке SELECT", async () => {
    const calls: CapturedCall[] = [];
    let i = 0;
    const sql = vi.fn().mockImplementation((strings: TemplateStringsArray) => {
      i++;
      const joined = Array.isArray(strings) ? strings.join("?") : String(strings);
      calls.push({ sql: joined, params: [] });
      if (i === 1) return Promise.resolve([{ acquired: true }]);
      if (i === 2) return Promise.reject(new Error("select failed"));
      return Promise.resolve([]);
    }) as unknown as import("postgres").Sql;

    await expect(expandTemplates(sql)).rejects.toThrow("select failed");
    expect(calls[calls.length - 1]?.sql).toContain("pg_advisory_unlock");
  });

  it("несколько templates — суммирует created", async () => {
    const t1 = { ...TMPL, id: "t1", weekdays: [1] }; // Пн
    const t2 = { ...TMPL, id: "t2", weekdays: [3] }; // Ср
    const now = new Date("2026-05-04T12:00:00Z");
    const seq: unknown[] = [[{ acquired: true }], [t1, t2]];
    // t1: Пн 04, Пн 11 → 2; t2: Ср 06, Ср 13 → 2
    for (let k = 0; k < 4; k++) seq.push([{ id: `r${k}` }]);
    seq.push([]);

    const { sql } = makeSqlSequence(seq);
    const result = await expandTemplates(sql, now);
    expect(result?.created).toBe(4);
  });
});
