import { describe, expect, it, vi } from "vitest";
import { oncePer } from "../../src/lib/once-per";

// Mock sql: .begin(fn) → fn(tx); tx — tagged-template fn возвращающая заранее заданные ответы
function makeSql(claimRows: Array<{ job_name: string }>) {
  const calls: Array<{ strings: readonly string[]; values: unknown[] }> = [];
  const tx = vi.fn((strings: readonly string[], ...values: unknown[]) => {
    calls.push({ strings, values });
    const joined = strings.join("?");
    if (joined.includes("SET LOCAL ROLE")) return Promise.resolve([]);
    if (joined.includes("INSERT INTO cron_state")) return Promise.resolve(claimRows);
    return Promise.resolve([]);
  });
  const sql = {
    begin: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as import("postgres").Sql;
  return { sql, tx, calls };
}

describe("oncePer", () => {
  it("runs fn when claim returns row (first run)", async () => {
    const { sql } = makeSql([{ job_name: "test_job" }]);
    const fn = vi.fn(() => Promise.resolve());
    const result = await oncePer(sql, "test_job", 60_000, fn);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("skips fn when claim returns no rows (recent run)", async () => {
    const { sql } = makeSql([]);
    const fn = vi.fn(() => Promise.resolve());
    const result = await oncePer(sql, "test_job", 60_000, fn);
    expect(result).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it("escalates role via SET LOCAL ROLE poputchiki_service", async () => {
    const { sql, calls } = makeSql([{ job_name: "j" }]);
    await oncePer(sql, "j", 60_000, () => Promise.resolve());
    const joined = calls.map((c) => c.strings.join("?"));
    expect(joined[0]).toContain("SET LOCAL ROLE poputchiki_service");
    expect(joined[1]).toContain("INSERT INTO cron_state");
  });

  it("passes jobName and intervalSec to INSERT", async () => {
    const { sql, calls } = makeSql([{ job_name: "foo" }]);
    await oncePer(sql, "foo", 120_000, () => Promise.resolve());
    const insert = calls.find((c) => c.strings.join("?").includes("INSERT INTO cron_state"));
    expect(insert?.values).toContain("foo");
    expect(insert?.values).toContain(120); // 120_000ms / 1000 = 120s
  });

  it("propagates fn errors", async () => {
    const { sql } = makeSql([{ job_name: "j" }]);
    const fn = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(oncePer(sql, "j", 60_000, fn)).rejects.toThrow("boom");
  });
});
